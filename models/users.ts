'use strict'

module.exports = (sequelize:any, DataTypes:any) => { 
    const Users = sequelize.define('users', {
        idUser: {type: DataTypes.INTEGER,  primaryKey:true, autoIncrement:true, allowNull: false},
        UserName: {type: DataTypes.STRING, allowNull: false},
        UserDiscriminator: {type: DataTypes.INTEGER(4).UNSIGNED.ZEROFILL, allowNull: false},
    });

    return Users;
};