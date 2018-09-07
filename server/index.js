require('isomorphic-fetch');
require('dotenv').config();

const fs = require('fs');
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const path = require('path');
const logger = require('morgan');
var bodyParser = require('body-parser')

const webpack = require('webpack');
const webpackMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');
const config = require('../config/webpack.config.js');

const ShopifyAPIClient = require('shopify-api-node');
const ShopifyExpress = require('@shopify/shopify-express');
const {MemoryStrategy} = require('@shopify/shopify-express/strategies');

const {
  SHOPIFY_APP_KEY,
  SHOPIFY_APP_HOST,
  SHOPIFY_APP_SECRET,
  NODE_ENV,
} = process.env;

const app = express();
const isDevelopment = NODE_ENV !== 'production';

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(logger('dev'));

const shopifyConfig = {
  host: SHOPIFY_APP_HOST,
  apiKey: SHOPIFY_APP_KEY,
  secret: SHOPIFY_APP_SECRET,
  scope: ['read_script_tags, write_script_tags'],
  shopStore: new MemoryStrategy(),
  afterAuth(request, response) {
    const { session: { accessToken, shop, trackingId } } = request;

console.log(request);
//Replace store name with 'shop'
  fetch('https://useinfluencestore.myshopify.com/admin/script_tags.json', {
    method: 'POST',
    headers:{
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    },
    body: {
      "script_tag": {
        "event": "onload",
        "src": "https://storage.googleapis.com/influence-197607.appspot.com/influence-analytics.js?trackingId=INF-406jkjiji00uszj"
      }
    }
    })

    registerWebhook(shop, accessToken, {
      topic: 'orders/create',
      address: `${SHOPIFY_APP_HOST}/order-create`,
      format: 'json'
    });

    return response.redirect('/');
  },
};

const registerWebhook = function(shopDomain, accessToken, webhook) {
  const shopify = new ShopifyAPIClient({ shopName: shopDomain, accessToken: accessToken });
  shopify.webhook.create(webhook).then(
    response => console.log(`webhook '${webhook.topic}' created`),
    err => console.log(`Error creating webhook '${webhook.topic}'. ${JSON.stringify(err.response.body)}`)
  );
}


app.use(
  session({
    store: isDevelopment ? undefined : new RedisStore(),
    secret: SHOPIFY_APP_SECRET,
    resave: true,
    saveUninitialized: false,
  })
);

// Run webpack hot reloading in dev
if (isDevelopment) {
  const compiler = webpack(config);
  const middleware = webpackMiddleware(compiler, {
    hot: true,
    inline: true,
    publicPath: config.output.publicPath,
    contentBase: 'src',
    stats: {
      colors: true,
      hash: false,
      timings: true,
      chunks: false,
      chunkModules: false,
      modules: false,
    },
  });

  app.use(middleware);
  app.use(webpackHotMiddleware(compiler));
} else {
  const staticPath = path.resolve(__dirname, '../assets');
  app.use('/assets', express.static(staticPath));
}

// Install
app.get('/install', (req, res) => {
  global.trackingId='';
  res.render('install',trackingId)
});

app.post('/install', (req, res) => {
global.trackingId='';
  fetch('https://useinfluencestore.myshopify.com/admin/script_tags.json', {
    method: 'POST',
    headers:{
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': 'accessToken'
    },
    body: {
      "script_tag": {
        "event": "onload",
        "src": "https://storage.googleapis.com/influence-197607.appspot.com/influence-analytics.js?trackingId=INF-406jkjiji00uszj"
      }
    }
    })
    console.log("Thanks for selecting campaign : ",req.body.radio1);
    res.render('install',{trackingId: req.body.radio1});
})

app.post('/campaigns', (req, res) => {
  global.campaignName;
  console.log("Welcome to campaigns : ",req.body.email, req.body.password);
  //Authentication Influence
  var url = 'https://strapi.useinfluence.co/auth/local/';
  var data = {"identifier": req.body.email, "password": req.body.password};
  fetch(url, {
    method: 'POST', // or 'PUT'
    body: JSON.stringify(data), // data can be `string` or {object}!
    headers:{
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token':'fff207438c062511c032d7a5468840ef'
    }
  }).then(res => res.json())
  .then(async response => {
    console.log('Success:', response.jwt);

    //Campaign fetch from UseInfluence
    var campaign_url = 'https://strapi.useinfluence.co/campaign';
    await fetch(campaign_url, {
      method: 'GET',
      headers:{
        Authorization: 'Bearer '+response.jwt
      }
    }).then(resp => resp.json())
    .then(response => {
        res.render('campaigns', { campaignName: response[0].campaignName, trackingId: response[0].trackingId});
    })
    .catch(error => console.error('Error:', error));
  })
  .catch(error => console.error('Error:', error));
});




// Create shopify middlewares and router
const shopify = ShopifyExpress(shopifyConfig);

// Mount Shopify Routes
const {routes, middleware} = shopify;
const {withShop, withWebhook} = middleware;

app.use('/shopify', routes);

// Client
app.get('/', withShop({authBaseUrl: '/shopify'}), function(request, response) {
  const { session: { shop, accessToken } } = request;
  response.render('app', {
    title: 'UseInfluence App',
    apiKey: shopifyConfig.apiKey,
    shop: shop,
  });
});

app.post('/order-create', withWebhook((error, request) => {
  if (error) {
    console.error(error);
    return;
  }

  console.log('We got a webhook!');
  console.log('Details: ', request.webhook);
  console.log('Body:', request.body);
}));

// Error Handlers
app.use(function(req, res, next) {
  const err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(function(error, request, response, next) {
  response.locals.message = error.message;
  response.locals.error = request.app.get('env') === 'development' ? error : {};

  response.status(error.status || 500);
  response.render('error');
});

module.exports = app;
