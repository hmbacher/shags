'use strict';

const fs = require('fs');
const http = require('http');
//const https = require('https');
const express = require('express');
const Docker = require('dockerode');

// HTTP(S) Server setup
const SERVER_PORT = process.env.SHAGS_PORT || 80;
const SERVER_HOST = process.env.SHAGS_HOST || '0.0.0.0';
/* SSL-STUFF
const HTTPS_CERT_FILENAME = process.env.SSL_CERT_FILE;
const HTTPS_KEY_FILENAME = process.env.SSL_KEY_FILE;

let sslOptions = {
  key: fs.readFileSync(HTTPS_KEY_FILENAME),
  cert: fs.readFileSync(HTTPS_CERT_FILENAME)
}; */

// Docker setup
var socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
var stats  = fs.statSync(socket);

if (!stats.isSocket()) {
  throw new Error('Are you sure the docker is running?');
}

var docker = new Docker({ socketPath: socket });


// Check health of all running containers
async function getHealthAll(asnum, idlist) {

  const reqPromises = [];
  const health = {};
  let ids = [];

  if (idlist !== undefined) {
    // Container ids/names have been provided
    ids = idlist.split(",");
  }
  else
  {
    // Get all containers
    const containers = await docker.listContainers({all: false});
    containers.forEach((c) => ids.push(c.Id));
  }

  // Get detailed status of every container
  ids.forEach((id) => {
    let thisProm = docker.getContainer(id).inspect();
    reqPromises.push(thisProm);
    thisProm.then((ci) => {
      // container with given id/name is existing
      if (ci.State.Health !== undefined) {
        health[ci.Name.substring(1)] = asnum ? (ci.State.Health.Status == "healthy" ? 1 : 0) : ci.State.Health.Status;
      } else {
        health[ci.Name.substring(1)] = asnum ? (ci.State.Status == "running" ? 1 : 0) : ci.State.Status;
      }
    })
    .catch((err) => {
      // container with given id/name is not existing or some other error
      health[id] = asnum ? 0 : "Failure: Could not determine information for requested container id.";
      console.error(err);
    });
  });

  await Promise.allSettled(reqPromises);
  return health;
}

// Check health of all running containers
async function getHealthById(id, asnum) {

  const ci = await docker.getContainer(id).inspect();
  if (ci.State.Health !== undefined) {
    return { status: asnum ? (ci.State.Health.Status == "healthy" ? 1 : 0) : ci.State.Health.Status };
  } else {
    return { status: asnum ? (ci.State.Status == "running" ? 1 : 0) : ci.State.Status };
  }

}

// Check state of all containers
async function getStateAll(asnum) {

  var states = {};
  var allrunning = true;

  const containers = await docker.listContainers({all: true});
  containers.forEach(function (c) {
    states[c.Names[0].substring(1)] = asnum ? (c.State == "running" ? 1 : 0) : c.State;
    allrunning = allrunning && (c.State === "running");
  });
  states['allRunning'] = asnum ? (allrunning == true ? 1 : 0) : allrunning;

  return states;
}

// App
const app = express();

// Entpoint /health
app.get('/health', async (req, res) => {

  try {
    const health = await getHealthAll(req.query.asnum, req.query.idlist);
    res.json(health);
  }
  catch (err) {
    console.error(err);

    if (err.statusCode !== undefined) {
      res.status(err.statusCode).json(err.json);
    } else {
      res.status(500).json(err);
    }
  }
});

// Entpoint /health/{id}
app.get('/health/:id', async (req, res) => {
  
  try {
    const status = await getHealthById(req.params.id, req.query.asnum);
    res.json(status);
  }
  catch (err) {
    console.error(err);

    if (err.statusCode !== undefined) {
      res.status(err.statusCode).json(err.json);
    } else {
      res.status(500).json(err);
    }
  }

});

// Entpoint /state
app.get('/state', async (req, res) => {

  try {
    const status = await getStateAll(req.query.asnum);
    res.json(status);
  }
  catch (err) {
    console.error(err);

    if (err.statusCode !== undefined) {
      res.status(err.statusCode).json(err.json);
    } else {
      res.status(500).json(err);
    }
  }

});

// Entpoint /diag, just to say: service is fine.
app.get('/diag', async (req, res) => {
  res.send('OK');
});
 

// Create the HTTPS server
//const server = http.createServer(sslOptions, app);
const server = http.createServer(app);
let serverPromise = new Promise(function(resolve, reject) {
  server.listen(SERVER_PORT, SERVER_HOST, () => {
    console.log(`HTTP(S) server listening on https://${SERVER_HOST}:${SERVER_PORT}.`);
    resolve();
  });
}).then( () => {  
  console.info('Smarthome Health Aggregator Service (SHAGS) is up.');
}).catch( err => {
  console.error(err);
});

configureSignalHandlers();

// Exit handling
function exitHandler(options) {
  
  if (options.info !== undefined) {
    console.warn(options.info);
  }

  if (options.cleanup) {
    console.info('Cleaning up...');
    cleanUp().then( () => {
      console.info('Cleaning up finished. Bye.');
    }).catch( err => {
      console.error(err);
    });
  } else {
    console.info('Bye.');
  }

}

function cleanUp() {

  // HTTP(S) Server shutdown
  console.info('Shutting down HTTP(S) server...');
  let serverShutdownPromise = new Promise(function(resolve, reject) {
    server.close(() => {
      console.info('HTTP(S) server shut down.');
      resolve();
    });
  });

  return serverShutdownPromise;
}

function configureSignalHandlers() {
  // Ctrl+C
  process.on('SIGINT', exitHandler.bind(null, {cleanup:true, info:'Service stopped with SIGINT (Ctrl+C).'})); 
  // Ctrl+'\'
  process.on('SIGQUIT', exitHandler.bind(null, {cleanup:true, info:'Service stopped with (Ctrl+\\).'})); 
  // Usually generated by 'kill'
  process.on('SIGTERM', exitHandler.bind(null, {cleanup:true, info:'Service stopped with SIGTERM.'})); 
  // Death of controlling prozess
  process.on('SIGHUP', exitHandler.bind(null, {cleanup:true, info:'Recieved signal SIGHUP.'})); 
  // Uncaught exception
  process.on('uncaughtException', err => {
    console.error(err);
    exitHandler({cleanup:true, info:'Unhandled expection (see logs for details).'});
  });
}