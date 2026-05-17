const { IMAGE_JOB_QUEUE } = require("./imageJobs");

let connection;
let channel;

const getAmqplib = () => {
  try {
    return require("amqplib");
  } catch (err) {
    err.message =
      "Missing RabbitMQ dependency 'amqplib'. Run npm install in server. " +
      err.message;
    throw err;
  }
};

const getRabbitUrl = () =>
  process.env.RABBITMQ_URL || "amqp://guest:guest@rabbitmq:5672";

const connectRabbitMQ = async () => {
  if (channel) return channel;

  const amqp = getAmqplib();
  connection = await amqp.connect(getRabbitUrl());
  channel = await connection.createChannel();
  await channel.assertQueue(IMAGE_JOB_QUEUE, { durable: true });

  connection.on("close", () => {
    channel = null;
    connection = null;
  });

  return channel;
};

const publishImageJob = async (job) => {
  const activeChannel = await connectRabbitMQ();
  const accepted = activeChannel.sendToQueue(
    IMAGE_JOB_QUEUE,
    Buffer.from(JSON.stringify(job)),
    {
      contentType: "application/json",
      persistent: true,
    },
  );

  if (!accepted) {
    throw new Error("RabbitMQ backpressure: image job was not accepted");
  }
};

const closeRabbitMQ = async () => {
  if (channel) await channel.close();
  if (connection) await connection.close();
  channel = null;
  connection = null;
};

module.exports = {
  connectRabbitMQ,
  publishImageJob,
  closeRabbitMQ,
};
