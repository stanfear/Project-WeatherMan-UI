const { promisify } = require('util');
const express = require('express');
const session = require('express-session');
const passport = require('passport'); 
const DiscordStrategy = require('passport-discord').Strategy;
const moment = require('moment');
const bodyParser = require('body-parser');
const app = express();
const mysql = require('mysql');
const axios = require('axios');
const schedule = require('node-schedule');


const params = require("./params.json");

const connection = mysql.createConnection(params.MySQL);

connection.config.queryFormat = function (query, values) {
    if (!values) return query;
    return query.replace(/\:(\w+)/g, function (txt, key) {
        if (values.hasOwnProperty(key)) {
            return this.escape(values[key]);
        }
        return txt;
    }.bind(this));
};


const queryAsync = promisify(connection.query).bind(connection);


connection.connect(function (err) {
    if (err) {
        console.error('error connecting: ' + err.stack);
        return;
    }
    console.log('connected as id ' + connection.threadId);
});




const ProjectPage = "/WeatherMan"


passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

params.Discord.scope = ['identify'];
passport.use(new DiscordStrategy(params.Discord,
    function (accessToken, refreshToken, profile, done) {
        process.nextTick(function () {
            return done(null, profile);
        });
    }));


app.use(session({
    secret: params.sessionSecret,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());  

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect(ProjectPage)
    }
    else {
        res.render('front-page', { weather: req.user});
    }
});

app.get('/login', passport.authenticate('discord', { scope: params.Discord.scope }), function (req, res) {});
app.get('/connection',
    passport.authenticate('discord', { failureRedirect: '/' }), function (req, res) { res.redirect(ProjectPage) } // auth success
);
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});


function checkAuth(req, res, next) {
    return next(); if (req.isAuthenticated()) return next();
    res.redirect('/');
}



app.get(ProjectPage, checkAuth, function (req, res) {
    res.render('index', { user: req.user});
});

app.get("/cell/:id", checkAuth, async function (req, res) {
    // query database
    let rows = await queryAsync(`
    SELECT 
        *
    FROM
        weatherman.accuweather_report acr
            JOIN
        weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
        WHERE
        c.idcell = :cellId
            AND NOT EXISTS( SELECT 
                *
            FROM
                weatherman.user_report ur
            WHERE
                ur.idCell = c.idcell
                    AND acr.reportTime = ur.ReportTime);`,
        {cellId : req.params.id});
    let slots = Array.from(rows, row => row.reportTime);

    res.render('cell-filler', { moment: moment, slots: slots, cell: req.params.id});
});

app.post("/cell/:id/:slot", checkAuth, async function (req, res) {

    await queryAsync(`
    INSERT INTO user_report (
        idUser,
        idCell,
        userReportTime,
        reportTime,
        inGameWeather,
        inGameEffect,
        inGameWind)
    SELECT 
        idUser,
        :cellId,
        NOW(),
        :slot,
        :weather,
        :effect,
        :wind 
    FROM weatherman.user u 
    WHERE 
        u.UserName = 'StanFyr' AND
        u.UserDiscriminator = 7270;`,
    {
        cellId: req.params.id,
        slot: new Date(req.params.slot * 1000),
        weather: req.body.MainWeather,
        effect: req.body.EffectWeather,
        wind: req.body.WindDirection 
    });
    res.sendStatus(200);
});

app.delete("/cell/:id/:slot", checkAuth, async function (req, res) {
    await queryAsync(`
    DELETE acr FROM accuweather_report acr
    JOIN
        weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
        WHERE
        c.idcell = :cellId
        AND acr.reportTime = :slot
            AND NOT EXISTS( SELECT
                *
            FROM
                weatherman.user_report ur
            WHERE
                ur.idCell = c.idcell
                    AND acr.reportTime = ur.ReportTime);`,
        {
            cellId: req.params.id,
            slot: new Date(req.params.slot * 1000)
        });

    res.sendStatus(200);
});

async function ExportAccuWeather() {

    let rows = await queryAsync("SELECT AccuWeatherCellId FROM weatherman.cell;");
    let promises = [];
    for (var i = 0, len = rows.length; i < len; i++) {
        let id = rows[i].AccuWeatherCellId
        let url = `http://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${id}?apikey=${params.AccuWeatherAPIKey}&details=true&metric=true`;
        promises.push(axios.get(url).then(res => { res.data.forEach(e => e.cell = id); return res; }));
    }
    var cellsResult = await Promise.all(promises);

    let slots = [].concat.apply([], Array.from(cellsResult, cell => cell.data));
    let values = Array.from(slots, row =>
        [
            row.cell,
            new Date(row.EpochDateTime * 1000),
            row.WeatherIcon,
            row.IconPhrase,
            row.IsDaylight,
            row.Temperature.Value,
            row.Wind.Speed.Value,
            row.Wind.Direction.Degrees,
            row.WindGust.Speed.Value,
            row.RelativeHumidity,
            row.Visibility.Value,
            row.Rain.Value,
            row.Snow.Value,
            row.Ice.Value,
            row.CloudCover,
            row.PrecipitationProbability
        ]);


    await queryAsync(`INSERT INTO weatherman.accuweather_report (
        AccuWeatherCellId,
        reportTime,
        WeatherIcon,
        WeatherDescription,
        isDaylight,
        Temperature,
        WindSpeed,
        WindDirection,
        WindGustSpeed,
        RelativeHumidity,
        Visibility,
        RainQuantity,
        SnowQuantity,
        IceQuantity,
        CloudCover,
        PrecipitationProbability)
    VALUES :values;`,
        {
            values: values
        });

}




app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});

var j = schedule.scheduleJob(params.AccuWeatherImportCRON, ExportAccuWeather);
console.log(`First run of "ExportAccuWeather" Scheduled at ${j.nextInvocation()}`);