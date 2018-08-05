import discord = require('passport-discord');


export interface Discord_DB_Profile extends discord.Strategy.Profile {
    DBid: number;
}