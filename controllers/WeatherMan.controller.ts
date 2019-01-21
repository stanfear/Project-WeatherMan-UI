// Import only what we need from express
import { Router, Request, Response, NextFunction } from 'express';
import types = require("../types");
import { S2Cell, S2CellId, S2LatLng, Utils } from "nodes2ts";
import moment = require('moment');

const util = require('util')


const db = require('../db');

// Assign router to the express.Router() instance
const router: Router = Router();

router.use("/", async function (req: Request, res: Response, next: NextFunction) {
    console.log(req.method + ": " + req.url);
    next();
});

router.get("/register", async function (req: Request, res: Response) {
    res.render('cell-selector');
});

router.post("/register", async function (req: Request, res: Response) {
    await req.app.locals.db.cells.create({idcell: req.body.token, iduser: (<types.Discord_DB_Profile>req.user).DBid});
    res.redirect("./cell");
});

router.get("/admin/cell", async function (req: Request, res: Response) {
    var inactiveCells = await req.app.locals.db.cells.findAll({
        include:[
            {
                model: req.app.locals.db.users
            }
        ],
        where:{
            isactive:false
        },
        order:['createdAt']
    })
    
    console.log(JSON.stringify(inactiveCells));

    let userscells = Array.from(inactiveCells, (cell:any) => <any>{ username: cell.user.UserName, id: cell.idcell, geoJSON: new S2Cell(S2CellId.fromToken(cell.idcell)).toGEOJSON()});
    res.render("admin-list-authorize", { cells: userscells});
});

router.delete("/admin/cell/:cellId", async function (req: Request, res: Response) {
    try{
        await req.app.locals.db.cells.destroy({where:{idcell: req.params.cellId}})
        res.sendStatus(200);
    }catch(e){
        console.log(e)
        res.sendStatus(500);
    }
});

router.get('/register/cellAt', function (req, res) {
    var s2 = new S2Cell(S2CellId.fromPoint(S2LatLng.fromDegrees(req.query.lat, req.query.lng).toPoint()).parentL(10));
    res.send({geoJson : s2.toGEOJSON(), token: s2.id.toToken()});
});




router.get("/cell", async function (req: Request, res: Response) {
    var user = await req.app.locals.db.users.findByPk((<types.Discord_DB_Profile>req.user).DBid, {
        include:[
            {
                model: req.app.locals.db.cells
            }
        ]
    })
    let userscells = Array.from(user.cells, (cell: any) => <any>{ id: cell.idcell, geoJSON: new S2Cell(S2CellId.fromToken(cell.idcell)).toGEOJSON(), active:cell.isactive });
    res.render('cell-list', { cells: userscells });
});


async function checkCellAccessRights(req: Request, res: Response, next: NextFunction) {
    try{
        var count = await req.app.locals.db.cells.count({
            where:{
                idcell: req.params.id,
                Iduser: (<types.Discord_DB_Profile>req.user).DBid
            }
        })
        if (count > 0) 
            return next();
    }catch(e){
        console.log(e)
        res.sendStatus(500);
    }
    res.redirect('/');
}



router.get("/cell/:id", checkCellAccessRights, async function (req: Request, res: Response) {
    // query database
    const Sequelize = require('sequelize');

    const sequelize = new Sequelize('sqlite:./database.sqlite');

    let rows = <any[]>await sequelize.query(
        `SELECT 
            DISTINCT acr.reportTime
        FROM
            accuweather_reports acr
                JOIN
            cells c ON c.AccuWeatherCellId = acr.AccuWeatherCellId
            WHERE
            reportTime < DATE() AND 
            c.idcell = $cellId
                AND NOT EXISTS( SELECT 
                    *
                FROM
                    user_reports ur
                WHERE
                    ur.idCell = c.idcell
                        AND acr.reportTime = ur.ReportTime);`,
        {
            type: req.app.locals.db.Sequelize.QueryTypes.SELECT,
            bind: { 
                cellId: req.params.id
            }
        }
    );
    let slots = Array.from(rows, row => new Date(row.reportTime));
    res.render('cell-filler', { moment: moment, slots: slots, cell: req.params.id });
});

router.post("/cell/:id/:slot", checkCellAccessRights, async function (req: Request, res: Response) {

    await req.app.locals.db.user_reports.create({
        iduser: (<types.Discord_DB_Profile>req.user).DBid,
        idcell: req.params.id,
        userReportTime: Date.now(),
        reportTime: new Date(req.params.slot * 1000),
        inGameWeather: req.body.MainWeather,
        inGameEffect: req.body.EffectWeather,
        inGameWind: req.body.WindDirection,
    });
    res.sendStatus(200);
});

router.delete("/cell/:id/:slot", checkCellAccessRights, async function (req: Request, res: Response) {

    let cnt:number = await req.app.locals.db.user_reports.count({
        where :{
            reportTime: moment.unix(req.params.slot).toDate()
        },
        include: [{
            model: req.app.locals.db.cells,
            where:{
                idcell: req.params.id
            }
        }]
    });

    if(cnt == 0){
        let cell = await req.app.locals.db.cells.findOne({
            where: {
                idcell: req.params.id
            },
            include:[{
                model: req.app.locals.db.accuweather_reports,
                where:{
                    reportTime: moment.unix(req.params.slot).toDate()
                }
            }]
        });
        cell.accuweather_reports.forEach(function(report:any) {
            report.destroy();
          });
        console.log(util.inspect(cell.accuweather_reports));

        res.sendStatus(200);
    } else {
        res.sendStatus(409);
    }
});


// Export the express.Router() instance to be used by server.ts
export const WeathermanController: Router = router;