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
app.locals.config = config;

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

app.listen(config.get("listeningPort"), function () {
    console.log('Example app listening on port ' + config.get("listeningPort"));
});

var j = schedule.scheduleJob(config.get("AccuWeatherImportCRON"), ExportAccuWeather);
j.on("scheduled", (arg: any[]) => console.log(`Next run of "ExportAccuWeather" Scheduled at ${arg}`))