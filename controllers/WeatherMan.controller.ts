// Import only what we need from express
import { Router, Request, Response, NextFunction } from 'express';
import types = require("../types");
import { S2Cell, S2CellId } from "nodes2ts";
import moment = require('moment');


// Assign router to the express.Router() instance
const router: Router = Router();

router.get("/cell", async function (req: Request, res: Response) {

    let rows = <any[]>await req.app.locals.bdQueryAsync(`
        SELECT 
            c.idcell
        FROM cell c
        WHERE c.iduser = :dbID`,
        {
            dbID: (<types.Discord_DB_Profile>req.user).DBid
        });
    let userscells = Array.from(rows, row => <any>{ id: row.idcell, geoJSON: new S2Cell(S2CellId.fromToken(row.idcell)).toGEOJSON() });
    res.render('cell-list', { cells: userscells });
});


async function checkCellAccessRights(req: Request, res: Response, next: NextFunction) {
    let rows = await <any[]>req.app.locals.bdQueryAsync(`
        SELECT count(*)
        FROM cell c
        WHERE 
            c.Idcell = :cellId AND
            c.Iduser = :userId`,
    {
        cellId: req.params.id,
        userId: (<types.Discord_DB_Profile>req.user).DBid
    });
    if (rows[0]["count(*)"]>0) return next();
    res.redirect('/');
}



router.get("/cell/:id", checkCellAccessRights, async function (req: Request, res: Response) {
    // query database
    let rows = <any[]>await req.app.locals.bdQueryAsync(`
    SELECT 
        DISTINCT reportTime
    FROM
        weatherman.accuweather_report acr
            JOIN
        weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
        WHERE
        reportTime < NOW() AND 
        c.idcell = :cellId
            AND NOT EXISTS( SELECT 
                *
            FROM
                weatherman.user_report ur
            WHERE
                ur.idCell = c.idcell
                    AND acr.reportTime = ur.ReportTime);`,
        { cellId: req.params.id });
    let slots = Array.from(rows, row => row.reportTime);

    res.render('cell-filler', { moment: moment, slots: slots, cell: req.params.id });
});

router.post("/cell/:id/:slot", checkCellAccessRights, async function (req: Request, res: Response) {

    await req.app.locals.bdQueryAsync(`
    INSERT INTO user_report (
        idUser,
        idCell,
        userReportTime,
        reportTime,
        inGameWeather,
        inGameEffect,
        inGameWind)
    SELECT 
        :dbID,
        :cellId,
        NOW(),
        :slot,
        :weather,
        :effect,
        :wind;`,
        {
            cellId: req.params.id,
            slot: new Date(req.params.slot * 1000),
            weather: req.body.MainWeather,
            effect: req.body.EffectWeather,
            wind: req.body.WindDirection,
            dbID: (<types.Discord_DB_Profile>req.user).DBid
        });
    res.sendStatus(200);
});

router.delete("/cell/:id/:slot", checkCellAccessRights, async function (req: Request, res: Response) {
    await req.app.locals.bdQueryAsync(`
    DELETE acr FROM accuweather_report acr
    JOIN
        weatherman.cell c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
        WHERE
        c.idcell = :cellId
        AND acr.reportTime = :slot
            AND NOT EXISTS( SELECT
                *
            FROM
                weatherman.user_report ur
            WHERE
                ur.idCell = c.idcell
                    AND acr.reportTime = ur.ReportTime);`,
        {
            cellId: req.params.id,
            slot: new Date(req.params.slot * 1000)
        });

    res.sendStatus(200);
});





// Export the express.Router() instance to be used by server.ts
export const WeathermanController: Router = router;