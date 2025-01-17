const express = require('express')
const app = express()
const config = require('./config');
const http = require('http');
const path = require("path");
const lodash = require('lodash');
const async = require('async');
const fs = require("fs");
const mkdirp = require('mkdirp');
const { exec } = require("child_process");
const redis = require("redis");
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

const centralRedis = redis.createClient({"host": config.redis.centralRedisHost});
centralRedis.on('error', function(err){ 
    console.error('Redis error:', err); 
  });
console.log("Redis connect done");

const port = 3000

//
// helper
//
function readAsync(file, callback) {
    fs.readFile(file, 'utf8', callback);
}

//
// Create a certificate with certbot
//
const ONE_MONTH = 2592000; // seconds

const createCert = (domain, cb) => {
    mkdirp(`/www-root/${domain}`).then((made) => {
        let cmd = `certbot certonly --webroot -w /www-root/${domain} -d ${domain} --agree-tos --noninteractive --keep -m info@codehooks.io`;
        if (config.certbot.dryrun) {
            cmd +=  " -n --dry-run";
        }
        if (config.certbot.staging) {
            cmd +=  " --staging";
        }
        const certbot = exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.log(`error: ${error.message}`);
                
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
                
            }
            console.log(`stdout: ${stdout}`);
        });
        certbot.on('exit', (code) => {
            /*
            fs.exists(`/etc/letsencrypt/live/${domain}`,function(exists){
                if (!exists) {
                    ...
                } else {
            */
            console.log(`certbot process exited with code ${code}`);
            if (code === 1) {
                cb(null, {"error": code});
            } else {
                const files = [
                    `/etc/letsencrypt/live/${domain}/privkey.pem`,
                    `/etc/letsencrypt/live/${domain}/cert.pem`,
                    `/etc/letsencrypt/live/${domain}/fullchain.pem`,
                    `/etc/letsencrypt/live/${domain}/chain.pem`
                ];
                async.map(files, readAsync, function(err, results) {
                    // results = ['file 1 content', 'file 2 content', ...]
                    // localRedis.setex("localdomain:"+host, 60, centralreply);
                    centralRedis.setex("cert:"+domain, ONE_MONTH ,JSON.stringify({privkey: results[0], cert: results[1], fullchain: results[2]}));
                    cb(null, {privkey: results[0], cert: results[1], fullchain: results[2], chain: results[3]});
                });                
            }
            
          });
    });
}


//
// Serve acme challenge
//
const serveAcmeChallenge = (req, res) => {
    const filePath = req.url;
    const domain = req.headers.host;
    console.log("Acme challenge", `/www-root/${domain}${filePath}`);
    fs.readFile(`/www-root/${domain}${filePath}`, "utf8", function(error, content) {
        if (error) {
            if(error.code == 'ENOENT'){
                console.log("Challenge file not found", filePath);
                res.writeHead(404, { 'Content-Type': "text/plain" });
                res.end("Not found", 'utf-8');            
            }
        }
        else {
            console.log("Challenge file is found", content);
            res.writeHead(200, { 'Content-Type': "text/plain" });
            res.end(content, 'utf-8');
        }
    });
}

app.get('/', (req, res) => res.send("I'm alive!"))

app.get('/.well-known/acme-challenge/:challenge', (req, res) => serveAcmeChallenge(req, res))

// create a queue object with concurrency 1
var certqueue = async.queue(function(task, callback) {
    createCert(task.domain, (err, certdata) => {
        console.log("certbot result", err, certdata)
        callback(err, certdata);
    })
}, 1);

app.post('/cert', function (req, res) {
    console.log("Post body", req.body);
    certqueue.push({"domain": req.body.domain}, (err, certdata) => {
        console.log("certbot result", err, certdata)
        res.json(certdata);
    })
    
})

app.listen(port, () => console.log(`Certservice app listening at http://localhost:${port}`))
