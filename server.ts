import { promisify } from 'util';
import { Connection, createConnection } from "mysql";
import config from 'config';
import axios = require('axios');
import schedule = require('node-schedule');
import { S2Cell, S2LatLng, S2CellId } from "nodes2ts";

//Express Related imports
import bodyParser = require('body-parser');
import passport = require('passport');
import discord = require('passport-discord');
import express = require('express');
import session = require('express-session');

// custom typings
import types = require("./types");

//Custom Controllers
import { WeathermanController } from './controllers';


const app: express.Application = express();

const connection: Connection = createConnection(config.get("MySQL"));
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

app.locals.bdQueryAsync = queryAsync;




passport.serializeUser((user: types.Discord_DB_Profile, done: (err: any, id?: types.Discord_DB_Profile) => void) => {
    done(null, user);
});
passport.deserializeUser((obj: types.Discord_DB_Profile, done: (err: any, user?: types.Discord_DB_Profile) => void) => {
    done(null, obj);
});

let DiscordParams: any = config.get("Discord");
DiscordParams.scope = ['identify'];
passport.use(new discord.Strategy(DiscordParams,
    async (accessToken: string, refreshToken: string, profile: discord.Strategy.Profile, done: (error: any, user?:any)=> void) => {
        let rows = <any[]>await queryAsync(`
        SELECT
            idUser
        FROM 
            weatherman.user u
        WHERE
            u.UserName = :username AND
            u.UserDiscriminator = :discriminator;`,
        { 
            username: profile.username,
            discriminator: profile.discriminator
        });
        (<types.Discord_DB_Profile>profile).DBid = rows[0].idUser;
        done(null, profile);
    }));


app.use(session({
    secret: config.get("sessionSecret"),
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());  

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');



//app.use('/WeatherMan', checkAuth);
app.use('/WeatherMan', checkAuth, WeathermanController);


app.get('/', function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/WeatherMan/cell");
    }
    else {
        res.render('front-page', { weather: req.user});
    }
});



app.get('/map', function (req, res) {
    res.render('map');
});


app.get('/map/S2Cell', function (req, res) {
    var s2 = new S2Cell(S2CellId.fromPoint(S2LatLng.fromDegrees(req.query.lat, req.query.lng).toPoint()).parentL(10));
    res.send(s2.toGEOJSON());
});





app.get('/login', passport.authenticate('discord', { scope: DiscordParams.scope }), function (req, res) {});
app.get('/connection',
    passport.authenticate('discord', { failureRedirect: '/' }), function (req, res) { res.redirect("/") } // auth success
);
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});


function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

// app.get("/cell", checkAuth, async function (req, res) {
    
//     let rows = <any[]>await queryAsync(`
//         SELECT 
//             c.idcell
//         FROM cell c
//         WHERE c.iduser = :dbID`,
//         {
//             dbID: (<Discord_DB_Profile>req.user).DBid
//         });
//     let userscells = Array.from(rows, row => <any>{ id: row.idcell, geoJSON: new S2Cell(S2CellId.fromToken(row.idcell)).toGEOJSON() });
//     res.render('cell-list', { cells: userscells });
// });

// app.get("/cell/:id", checkAuth, async function (req, res) {
//     // query database
//     let rows = <any[]>await queryAsync(`
//     SELECT 
//         DISTINCT reportTime
//     FROM
//         weatherman.accuweather_report acr
//             JOIN
//         weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
//         WHERE
//         reportTime < NOW() AND 
//         c.idcell = :cellId
//             AND NOT EXISTS( SELECT 
//                 *
//             FROM
//                 weatherman.user_report ur
//             WHERE
//                 ur.idCell = c.idcell
//                     AND acr.reportTime = ur.ReportTime);`,
//         {cellId : req.params.id});
//     let slots = Array.from(rows, row => row.reportTime);

//     res.render('cell-filler', { moment: moment, slots: slots, cell: req.params.id});
// });

// app.post("/cell/:id/:slot", checkAuth, async function (req, res) {

//     await queryAsync(`
//     INSERT INTO user_report (
//         idUser,
//         idCell,
//         userReportTime,
//         reportTime,
//         inGameWeather,
//         inGameEffect,
//         inGameWind)
//     SELECT 
//         :dbID,
//         :cellId,
//         NOW(),
//         :slot,
//         :weather,
//         :effect,
//         :wind;`,
//     {
//         cellId: req.params.id,
//         slot: new Date(req.params.slot * 1000),
//         weather: req.body.MainWeather,
//         effect: req.body.EffectWeather,
//         wind: req.body.WindDirection ,
//         dbID: (<Discord_DB_Profile>req.user).DBid
//     });
//     res.sendStatus(200);
// });

// app.delete("/cell/:id/:slot", checkAuth, async function (req, res) {
//     await queryAsync(`
//     DELETE acr FROM accuweather_report acr
//     JOIN
//         weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
//         WHERE
//         c.idcell = :cellId
//         AND acr.reportTime = :slot
//             AND NOT EXISTS( SELECT
//                 *
//             FROM
//                 weatherman.user_report ur
//             WHERE
//                 ur.idCell = c.idcell
//                     AND acr.reportTime = ur.ReportTime);`,
//         {
//             cellId: req.params.id,
//             slot: new Date(req.params.slot * 1000)
//         });

//     res.sendStatus(200);
// });

async function ExportAccuWeather() {

    let rows = await queryAsync("SELECT DISTINCT AccuWeatherCellId FROM weatherman.cell;");
    let promises = [];
    for (var i = 0, len = rows.length; i < len; i++) {
        let id = rows[i].AccuWeatherCellId
        let url = `http://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${id}?apikey=${config.get("AccuWeatherAPIKey")}&details=true&metric=true`;
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



connection.connect(function (err) {
    if (err) {
        console.error('error connecting: ' + err.stack);
        return;
    }
    console.log('connected as id ' + connection.threadId);
});


app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});

var j = schedule.scheduleJob(config.get("AccuWeatherImportCRON"), ExportAccuWeather);
j.on("scheduled", (arg: any[]) => console.log(`Next run of "ExportAccuWeather" Scheduled at ${arg}`))