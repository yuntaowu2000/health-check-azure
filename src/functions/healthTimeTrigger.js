const { app } = require('@azure/functions');

const agent = require('superagent');
const fs = require('fs');
const serverData = fs.readFileSync('./.jsonfiles/servers.json', 'utf8');
const serverList = JSON.parse(serverData);

const nodemailer = require('nodemailer');
const emailID = fs.readFileSync('./.jsonfiles/email.json', 'utf8');
const emailObj = JSON.parse(emailID);
const transporter = nodemailer.createTransport({
  host: emailObj.server,
  port: emailObj.port,
  auth: {
    user: emailObj.user,
    pass: emailObj.key
  }
})

const { MongoClient } = require('mongodb');
const databaseConfig = fs.readFileSync('./.jsonfiles/database.json', 'utf8');
const databaseConfigObj = JSON.parse(databaseConfig);
const dbName = databaseConfigObj["db_name"]
const collectionName = databaseConfigObj["collection_name"]
const client = new MongoClient(databaseConfigObj["cosmos_conn_str"]);

app.timer('healthTimeTrigger', {
    schedule: '0 0 */2 * * *',
    // schedule: '30 * * * * *',
    handler: async (myTimer, context) => {
        try {
            context.log('Timer function processed request.');
            await client.connect();
            const collection = client.db(dbName).collection(collectionName);
            // const indexRes = await collection.createIndex({name: 1});
            // context.log(`Creating name index ${indexRes}`);
            // const indexRes2 = await collection.createIndex({status: 1}, {expireAfterSeconds: 7500});
            // context.log(`Creating status index ${indexRes2}`);
            // await collection.updateOne({name: serverList[0].name}, { $set: { status: "failed" } }, {upsert: true});
            let failed = [];
            
            for (let sd of serverList) {
                try {
                    console.log("try connecting: " + sd.host + " at " + sd.ip);
                    const res = await agent.head(sd.host).connect(sd.ip).ok(res => res.status < 400).timeout({response: 9000, deadline:10000}).retry(2);
                    if (res.statusCode >= 400) {
                        let f = {"name" : sd.name, "host" : sd.host, "ip" : sd.ip, "status" : res.statusCode};
                        
                        let prev_record = await collection.findOne({name: sd.name});
                        if (prev_record.status == "failed") {
                            // this is the second failure
                            failed.push(f);
                        }
                        // set record with expiration = 125min=7500 sec
                        await collection.updateOne({name: sd.name}, { $set: { status: "failed" } }, {upsert: true});
                    }
                } catch(err) {
                    let f = {"name" : sd.name, "host" : sd.host, "ip" : sd.ip, "status" : err};
                    
                    let prev_record = await collection.findOne({name: sd.name});
                    if (prev_record.status == "failed") {
                        // this is the second failure
                        failed.push(f);
                    }
                    // set record with expiration = 125min=7500 sec
                    await collection.updateOne({name: sd.name}, { $set: { status: "failed" } }, {upsert: true});
                }
            }
            
            if (failed.length > 0) {
                await transporter.sendMail({
                    from: emailObj.user,
                    to: emailObj.to,
                    subject: "Server connection failed from Azure Function",
                    text: JSON.stringify(failed)
                });
            }
        } catch(err) {
            console.log(err);
            await transporter.sendMail({
              from: emailObj.user,
              to: emailObj.to,
              subject: "Azure Function App execution error",
              text: `${err.name}: ${err.message}`,
            });
          }
    }
});
