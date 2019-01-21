'use strict'

module.exports = (sequelize:any, DataTypes:any) => { 
    const Cells = sequelize.define('cells', {
        idcell: {type: DataTypes.STRING(16), primaryKey:true, unique:true},
        AccuWeatherCellId: {type: DataTypes.STRING(45), unique:true},
        TimeZone: {type: DataTypes.STRING(45)},
        iduser: {
            type: DataTypes.INTEGER,
            references:{
                model: sequelize.models.users,
                key:"idUser"
            }
        },
        isactive: {type:DataTypes.BOOLEAN, defaultValue: false},
    });

    return Cells;
};