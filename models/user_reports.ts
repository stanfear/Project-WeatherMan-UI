'use strict'

module.exports = (sequelize:any, DataTypes:any) => { 
    const UserReports = sequelize.define('user_reports', {
        idcell : {
            type : DataTypes.STRING(16),
            allowNull: false,
            unique:"CellUser",
            primaryKey:true,
            references:{
                model: sequelize.models.cells,
                key:"idcell"
            }
        },
        iduser : {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique:"CellUser",
            primaryKey:true,
            references:{
                model: sequelize.models.users,
                key:"iduser"
            }
        },
        userReportTime : {type:DataTypes.DATE, allowNull: false},
        reportTime : {type:DataTypes.DATE, allowNull: false},
        inGameWeather : {type: DataTypes.STRING(45)},
        inGameEffect : {type: DataTypes.STRING(45)},
        inGameWind : {type: DataTypes.STRING(45)}
    });
    return UserReports;
};