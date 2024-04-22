'use strict'

const fp = require('fastify-plugin')

module.exports = fp(async function (fastify, opts) {
  fastify.decorate('sendMessage', function (message) {
    const body = message.toString()
    console.log(`sending message ${body} to ${process.env.ORDER_QUEUE_NAME} on ${process.env.ORDER_QUEUE_HOSTNAME}`)

    if (process.env.ORDER_QUEUE_USERNAME && process.env.ORDER_QUEUE_PASSWORD) {
      console.log('using ORDER_QUEUE_USERNAME and ORDER_QUEUE_PASSWORD credentials')
      
      const rhea = require('rhea')
      const container = rhea.create_container()
      var amqp_message = container.message;

      const connectOptions = {
        hostname: process.env.ORDER_QUEUE_HOSTNAME,
        host: process.env.ORDER_QUEUE_HOSTNAME,
        port: process.env.ORDER_QUEUE_PORT,
        username: process.env.ORDER_QUEUE_USERNAME,
        password: process.env.ORDER_QUEUE_PASSWORD,
        reconnect_limit: process.env.ORDER_QUEUE_RECONNECT_LIMIT || 0
      }
      
      if (process.env.ORDER_QUEUE_TRANSPORT !== undefined) {
        connectOptions.transport = process.env.ORDER_QUEUE_TRANSPORT
      }
      
      const connection = container.connect(connectOptions)
      
      container.once('sendable', function (context) {
        const sender = context.sender;
        sender.send({
          body: amqp_message.data_section(Buffer.from(body,'utf8'))
        });
        sender.close();
        connection.close();
      })

      connection.open_sender(process.env.ORDER_QUEUE_NAME)
    } else if (process.env.ORDER_QUEUE_AZUREAD_AUTH === 'true') {
      const { ServiceBusClient } = require("@azure/service-bus");
      const { DefaultAzureCredential } = require("@azure/identity");

      console.log('using ORDER_QUEUE_AZUREAD_AUTH credentials')
      
      const fullyQualifiedNamespace = process.env.ORDER_QUEUE_HOSTNAME
      const queueName = process.env.ORDER_QUEUE_NAME

      const credential = new DefaultAzureCredential();

      async function sendMessage() {
        const sbClient = new ServiceBusClient(fullyQualifiedNamespace, credential);
        const sender = sbClient.createSender(queueName);

        try {
          await sender.sendMessages({ body: body });
        } finally {
          await sender.close();
          await sbClient.close();
        }
      }
      sendMessage().catch(console.error);
    } else {
      console.log('no credentials set for message queue. exiting.')
      return
    }
  })
})
