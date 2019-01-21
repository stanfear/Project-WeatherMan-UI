import { promisify } from 'util';
import { Connection, createConnection } from "mysql";
import config from 'config';
import axios = require('axios');
import schedule = require('node-schedule');

//Express Related imports
import bodyParser = require('body-parser');
import passport = require('passport');
import discord = require('passport-discord');
import express = require('express');
import session = require('express-session');

// custom typings
import types = require("./types");

const db = require('./db');

//Custom Controllers
import { WeathermanController } from './controllers';
const app: express.Application = express();

db.sequelize.sync();

app.locals.db = db;

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
        db.users
            .findOrCreate({where: {UserName:profile.username, UserDiscriminator:profile.discriminator}})
            .spread((user: any, created:boolean) => {
                (<types.Discord_DB_Profile>profile).DBid = user.dataValues.idUser;
                
                //console.log(user);
                //console.log(created);

                done(null, profile);
            });
    })
);


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
    let cells = await db.cells.findAll({
        where :{
            isactive: true
        }
    });

    let promises:any = [];
    for (var i = 0, len = cells.length; i < len; i++) {
        let id = cells[i].AccuWeatherCellId;
        let url = `http://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${id}?apikey=${config.get("AccuWeatherAPIKey")}&details=true&metric=true`;
        promises.push(axios.default.get(url).then(res => { (<any[]>res.data).forEach(e => e.cell = id); return res; }));
    };
    
    var cellsResult = await Promise.all(promises);

    let slots = <any[]>[].concat.apply([], Array.from(cellsResult, (cell:any) => cell.data));
    let values = Array.from(slots, row => {
        return {
            AccuWeatherCellId : row.cell,
            reportTime : new Date(row.EpochDateTime * 1000),
            WeatherIcon : row.WeatherIcon,
            WeatherDescription : row.IconPhrase,
            isDaylight : row.IsDaylight,
            Temperature : row.Temperature.Value,
            WindSpeed : row.Wind.Speed.Value,
            WindDirection : row.Wind.Direction.Degrees,
            WindGustSpeed : row.WindGust.Speed.Value,
            RelativeHumidity : row.RelativeHumidity,
            Visibility : row.Visibility.Value,
            RainQuantity : row.Rain.Value,
            SnowQuantity : row.Snow.Value,
            IceQuantity : row.Ice.Value,
            CloudCover : row.CloudCover,
            PrecipitationProbability : row.PrecipitationProbability
        }
    });
    db.accuweather_reports.bulkCreate(values);
}

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});

//ExportAccuWeather()

//var j = schedule.scheduleJob(config.get("AccuWeatherImportCRON"), ExportAccuWeather);
//j.on("scheduled", (arg: any[]) => console.log(`Next run of "ExportAccuWeather" Scheduled at ${arg}`))