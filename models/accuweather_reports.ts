'use strict'

module.exports = (sequelize :any, DataTypes :any) => { 
    const AccuweatherReports = sequelize.define('accuweather_reports', {
        idaccuweather_report: {type: DataTypes.INTEGER,  primaryKey:true, autoIncrement:true, allowNull: false},
        reportQueryTime: {type:DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW}, 
        AccuWeatherCellId:{
            type:DataTypes.STRING(45),
            allowNull: false,
            references:{
                model: sequelize.models.cells,
                key:"AccuWeatherCellId"
            }
        },
        reportTime : {type:DataTypes.DATE},
        WeatherIcon : {type:DataTypes.INTEGER},
        WeatherDescription : {type:DataTypes.STRING(45)},
        isDaylight : {type:DataTypes.BOOLEAN},
        Temperature : {type:DataTypes.FLOAT(4,1)},
        WindSpeed : {type:DataTypes.FLOAT(4,1)},
        WindDirection : {type:DataTypes.INTEGER},
        WindGustSpeed : {type:DataTypes.FLOAT(4,1)},
        RelativeHumidity : {type:DataTypes.FLOAT(4,1)},
        Visibility : {type:DataTypes.FLOAT(4,1)},
        RainQuantity : {type:DataTypes.FLOAT(4,1)},
        SnowQuantity : {type:DataTypes.FLOAT(4,1)},
        IceQuantity : {type:DataTypes.FLOAT(4,1)},
        CloudCover : {type:DataTypes.FLOAT(4,1)},
        PrecipitationProbability : {type:DataTypes.FLOAT(3,0)},
    });

    return AccuweatherReports;
};