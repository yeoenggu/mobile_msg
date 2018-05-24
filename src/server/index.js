import dotenv from 'dotenv'
import express from 'express'
import 'isomorphic-fetch'
import session from 'express-session'

const result = dotenv.config()
const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);

// revist:  
// import App from '../common/containers/App';
// import { Provider } from 'react-redux';
// import React from 'react';
// import qs from 'qs';
// import { renderToString } from 'react-dom/server';
// import serialize from 'serialize-javascript';

const RedisStore = require('connect-redis')(session);
const path = require('path');
const logger = require('morgan');

const ShopifyAPIClient = require('shopify-api-node');
const ShopifyExpress = require('@shopify/shopify-express');
const {MemoryStrategy} = require('@shopify/shopify-express/strategies');

// end 
// console.log("*******")
// console.log(process.cwd())
// console.log("*******")
// config
const {
  SHOPIFY_APP_KEY,
  SHOPIFY_APP_HOST,
  SHOPIFY_APP_SECRET,
  NODE_ENV,
} = result.parsed;  
// REVISIT:
// razzle does not handle well with process.env at the moment.
// refer
// https://github.com/jaredpalmer/razzle/issues/528
// This should be revisited when the issue is fixed.

const shopifyConfig = {
  host: SHOPIFY_APP_HOST,
  apiKey: SHOPIFY_APP_KEY,
  secret: SHOPIFY_APP_SECRET,
  scope: ['write_orders, write_products'],
  shopStore: new MemoryStrategy(),
  afterAuth(request, response) {
    const { session: { accessToken, shop } } = request;

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

// Create shopify middlewares and router
const shopify = ShopifyExpress(shopifyConfig);

// Mount Shopify Routes
const {routes, middleware} = shopify;
const {withShop, withWebhook} = middleware;

// end

// const assets = require(process.env.RAZZLE_ASSETS_MANIFEST);
const isDevelopment = NODE_ENV !== 'production';
const server = express();

server
  .disable('x-powered-by')
  .use(express.static(process.env.RAZZLE_PUBLIC_DIR))
  .set('views', path.join(__dirname, 'views'))
  .set('view engine', 'ejs')
  .use(logger('dev'))
  .use(
    session({
      store: isDevelopment ? undefined : new RedisStore(),
      secret: SHOPIFY_APP_SECRET,
      resave: true,
      saveUninitialized: false,
    })
  )
  .get('/install', (req, res) => res.render('install'))
  .use('/shopify', routes)
  .get('/', withShop({authBaseUrl: '/shopify'}), function(request, response) {
      const { session: { shop, accessToken } } = request;
      console.log(assets.client.js)
      response.render('app', {
        title: 'Shopify Node App',
        apiKey: shopifyConfig.apiKey,
        shop: shop,
        assets: assets,
      });
  })
  .post('/order-create', withWebhook((error, request) => {
  if (error) {
    console.error(error);
    return;
  }

    console.log('We got a webhook!');
    console.log('Details: ', request.webhook);
    console.log('Body:', request.body);
  }))
  .use(function(req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
  })
  .use(function(error, request, response, next) {
    response.locals.message = error.message;
    response.locals.error = request.app.get('env') === 'development' ? error : {};

    response.status(error.status || 500);
    response.render('error');
  });

export default server;
