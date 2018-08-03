import { promisify } from 'util';
import { Connection, createConnection } from "mysql";
//import express = require('express');
import session = require('express-session');
import passport = require('passport'); 
import moment = require('moment');
import bodyParser = require('body-parser');
import axios = require('axios');
import schedule = require('node-schedule');

import discord = require('passport-discord');
import express = require('express');


const app = express();
const params = require("../params.json");

const connection: Connection = createConnection(params.MySQL);

connection.config.queryFormat = function (query, values) {
    if (!values) return query;
    return query.replace(/\:(\w+)/g, function (txt: string, key: any) {
        if (values.hasOwnProperty(key)) {
            return connection.escape(values[key]);
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


passport.serializeUser((user: discord.Strategy.Profile, done: (err: any, id?: discord.Strategy.Profile) => void) => {
    done(null, user);
});
passport.deserializeUser((obj: discord.Strategy.Profile, done: (err: any, user?: discord.Strategy.Profile) => void) => {
    done(null, obj);
});

params.Discord.scope = ['identify'];
passport.use(new discord.Strategy(params.Discord,
    (accessToken: string, refreshToken: string, profile: discord.Strategy.Profile, done: (error: any, user?:any)=> void) => {
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


function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    return next(); if (req.isAuthenticated()) return next();
    res.redirect('/');
}



app.get(ProjectPage, checkAuth, function (req, res) {
    res.render('index', { user: req.user});
});

app.get("/cell/:id", checkAuth, async function (req, res) {
    // query database
    let rows = <any[]>await queryAsync(`
    SELECT 
        DISTINCT reportTime
    FROM
        weatherman.accuweather_report acr
            JOIN
        weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
        WHERE
        reportTime < NOW() AND 
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
        promises.push(axios.default.get(url).then(res => { (<any[]>res.data).forEach(e => e.cell = id); return res; }));
    }
    var cellsResult = await Promise.all(promises);

    let slots = <any[]>[].concat.apply([], Array.from(cellsResult, cell => cell.data));
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