const express = require('express');
const session = require('express-session');
const passport = require('passport'); 
const DiscordStrategy = require('passport-discord').Strategy;
const moment = require('moment');
const bodyParser = require('body-parser');
const app = express();


const params = require("./params.json");


const ProjectPage = "/WeatherMan"

var scopes = ['identify'/*, 'email', 'connections', (it is currently broken) 'guilds', 'guilds.join'*/];


passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: params.clientID,
    clientSecret: params.clientSecret,
    callbackURL: params.callbackURL,
    scope: scopes
},
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
        res.render('front-page', { weather: req.user, error: null });
    }

});

app.get('/login', passport.authenticate('discord', { scope: scopes }), function (req, res) {});
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

app.get("/cell/:id", checkAuth, function (req, res) {
    slots = [new Date(2018, 07, 28, 15), new Date(2018, 07, 28, 16), new Date(2018, 07, 28, 17)]

    res.render('cell-filler', { moment : moment, slots: slots});
});

app.post("/cell/:id/:slot", checkAuth, function (req, res) {
    console.log(JSON.stringify(req.body));
    res.sendStatus(200);
});

app.delete("/cell/:id/:slot", checkAuth, function (req, res) {
    console.log(JSON.stringify(req.route)); 
    console.log(JSON.stringify(req.params));
    res.sendStatus(200);
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!')
});

