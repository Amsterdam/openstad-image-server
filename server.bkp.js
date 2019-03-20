require('dotenv').config();
const fs = require('fs');
const http = require('http');
const express = require('express');
const errorHandler  = require('express-json-errors');
const jsonErrorHandler = require('express-json-error-handler').default;
const proxy = require('http-proxy-middleware');
const app = express();
const imgSteam = require('image-steam');
const multer = require('multer');
const passport = require('passport');
const Strategy = require('passport-http-bearer').Strategy;
const db = require('./db');
// const imageSteamConfig = require('./config/image-steam');

console.log('--> scripts update');


const upload = multer({
    dest: 'images/',
    onError : function(err, next) {
      next(err);
    },
    fileFilter: function (req, file, cb) {
      const allowedTypes = [
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/svg+xml'
      ];

     if (allowedTypes.indexOf(file.mimetype) === -1) {
      req.fileValidationError = 'goes wrong on the mimetype';
      return cb(null, false, new Error('goes wrong on the mimetype'));
     }

     cb(null, true);
   }
});

const imageSteamConfig = {
  "storage": {
     "defaults": {
       "driver": "fs",
       "path": "./images",
     },
  },

  log : {
    errors: false
  }
}


if (process.env.THROTTLE) {
  imageSteamConfig.throttle =  {
      "ccProcessors": process.env.THROTTLE_CC_PROCESSORS,
      "ccPrefetchers": process.env.THROTTLE_CC_PREFETCHER,
      "ccRequests": process.env.THROTTLE_CC_REQUESTS
  };
}

const argv = require('yargs')
  .usage('Usage: $0 [options] pathToImage')
  .demand(0)
  .options({
    'port': {
      alias: 'p',
      describe: 'Port number the service will listen to',
      type: 'number',
      group: 'Image service',
      default: process.env.PORT_API || 9999
    },
    'portImageSteam': {
      alias: 'pis',
      describe: 'Port number the Image server will listen to',
      type: 'number',
      group: 'Image service',
      default: process.env.PORT_IMAGE_SERVER ||  13337
    },
  })
  .help()
  .argv;

passport.use(new Strategy(
  (token, done) => {
    console.log('===> token', token);
    db.clients.findByToken(token, function (err, client) {
      if (err) { return done(err); }
      if (!client) { return done(null, false); }
      return done(null, client, { scope: 'all' });
    });
  }
));

/**
 * Instantiate the Image steam server, and proxy it with
 */
const ImageServer = new  imgSteam.http.Connect(imageSteamConfig);
const imageHandler = ImageServer.getHandler();

app.use((req, res, next) => {
  var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  console.log('=====> req', fullUrl);
  next();
});

app.get('/image/*',
  function(req, res, next) {

    req.url = req.url.replace('/image', '');

    /**
     * Pass request en response to the imageserver
     */
    imageHandler(req, res);

    /**
     * Most error is not found
     * @TODO: requires debugging if other errors are handled by server
     */
    ImageServer.on('error', (err) => {
      err.status = 404;
      err.msg = 'Not found';
      next(err);
    });
});

/**
 *  The url for creating one Image
 */
app.post('/image',
//  passport.authenticate('bearer', { session: false }),
  upload.single('image'), (req, res, next) => {
  // req.file is the `image` file
  // req.body will hold the text fields, if there were any
  res.setHeader('Content-Type', 'application/json');

  console.log('--> upload image file', req.file);
  console.log('--> upload image filename', req.file.filename);

  res.send(JSON.stringify({
    url: process.env.APP_URL + '/image/' + req.file.filename
  }));
});

app.post('/images',
  passport.authenticate('bearer', { session: false }),
  upload.array('images', 30), (req, res, next) => {
  // req.files is array of `photos` files
  // req.body will contain the text fields, if there were any
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(req.files.map((file) => {
    return {
      url:process.env.APP_URL + '/image/' + req.file.filename
    }
  })));
});

app.use(function (err, req, res, next) {
  console.log('=====> err', err);
  const status = err.status ?  err.status : 500;
  //console.log('err', err);
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify({
    error: err.msg
  }));
})

app.listen(argv.port, function () {
  console.log('Application listen on port %d...', argv.port);
  //console.log('Image  server listening on port %d...', argv.portImageSteam);
});
