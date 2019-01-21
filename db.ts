'use strict'

const Sequelize = require('sequelize');

const sequelize = new Sequelize('sqlite:./database.sqlite');

// Connect all the models/tables in the database to a db object, 
//so everything is accessible via one object
const db:any = {};

db.Sequelize = Sequelize;  
db.sequelize = sequelize;

//Models/tables
db.users = require('./models/users.js')(sequelize, Sequelize);  
db.cells = require('./models/cells.js')(sequelize, Sequelize);  
db.user_reports = require('./models/user_reports.js')(sequelize, Sequelize);
db.accuweather_reports = require('./models/accuweather_reports.js')(sequelize, Sequelize);


//Relations
db.cells.belongsTo(db.users, {foreignKey: 'iduser', targetKey: 'idUser'});  
db.users.hasMany(db.cells, {foreignKey: 'iduser', sourceKey: 'idUser'});

db.user_reports.belongsTo(db.cells, {foreignKey: 'idcell', targetKey: 'idcell'});
db.user_reports.belongsTo(db.users, {foreignKey: 'iduser', targetKey: 'idUser'});
db.cells.hasMany(db.user_reports, {foreignKey: 'idcell', sourceKey: 'idcell'});  
db.users.hasMany(db.user_reports, {foreignKey: 'iduser', sourceKey: 'idUser'});

db.accuweather_reports.belongsTo(db.cells, {foreignKey: 'AccuWeatherCellId', targetKey: 'AccuWeatherCellId'});  
db.cells.hasMany(db.accuweather_reports, {foreignKey: 'AccuWeatherCellId', sourceKey: 'AccuWeatherCellId'});

module.exports = db;



/*
const UserModel = sequelize.define('user', {
    idUser: {type: Sequelize.INTEGER,  primaryKey:true, autoIncrement:true, allowNull: false},
    UserName: {type: Sequelize.STRING, allowNull: false},
    UserDiscriminator: {type: Sequelize.INTEGER(4).UNSIGNED.ZEROFILL, allowNull: false},
});

const CellModel = sequelize.define('cell', {
    idcell: {type: Sequelize.STRING(16), primaryKey:true, unique:true},
    AccuWeatherCellId: {type: Sequelize.STRING(45), unique:true},
    TimeZone: {type: Sequelize.STRING(45)},
    iduser: {
        type: Sequelize.INTEGER,
        references:{
            model: UserModel,
            key:"idUser"
        }
    },
    isactive: {type:Sequelize.BOOLEAN, defaultValue: false},
});

const UserReportModel = sequelize.define('user_report', {
    idcell : {
        type : Sequelize.STRING(16),
        allowNull: false,
        unique:"CellUser",
        primaryKey:true,
        references:{
            model: CellModel,
            key:"idcell"
        }
    },
    iduser : {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique:"CellUser",
        primaryKey:true,
        references:{
            model: UserModel,
            key:"iduser"
        }
    },
    userReportTime : {type:Sequelize.DATE, allowNull: false},
    reportTime : {type:Sequelize.DATE, allowNull: false},
    inGameWeather : {type: Sequelize.STRING(45)},
    inGameEffect : {type: Sequelize.STRING(45)},
    inGameWind : {type: Sequelize.STRING(45)}
});

const AccuweatherReportModel = sequelize.define('accuweather_report', {
    idaccuweather_report: {type: Sequelize.INTEGER,  primaryKey:true, autoIncrement:true, allowNull: false},
    reportQueryTime: {type:Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
    AccuWeatherCellId:{
        type:Sequelize.STRING(45),
        allowNull: false,
        references:{
            model: CellModel,
            key:"idcell"
        }
    },
    reportTime : {type:Sequelize.DATE},
    WeatherIcon : {type:Sequelize.INTEGER},
    WeatherDescription : {type:Sequelize.STRING(45)},
    isDaylight : {type:Sequelize.BOOLEAN},
    Temperature : {type:Sequelize.FLOAT(4,1)},
    WindSpeed : {type:Sequelize.FLOAT(4,1)},
    WindDirection : {type:Sequelize.INTEGER},
    WindGustSpeed : {type:Sequelize.FLOAT(4,1)},
    RelativeHumidity : {type:Sequelize.FLOAT(4,1)},
    Visibility : {type:Sequelize.FLOAT(4,1)},
    RainQuantity : {type:Sequelize.FLOAT(4,1)},
    SnowQuantity : {type:Sequelize.FLOAT(4,1)},
    IceQuantity : {type:Sequelize.FLOAT(4,1)},
    CloudCover : {type:Sequelize.FLOAT(4,1)},
    PrecipitationProbability : {type:Sequelize.FLOAT(3,0)},
});
*/