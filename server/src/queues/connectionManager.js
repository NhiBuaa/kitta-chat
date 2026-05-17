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
  process.env.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";

const createRabbitConnectionManager = ({
  amqp = getAmqplib(),
  url = getRabbitUrl(),
  queues = [],
} = {}) => {
  let connection;
  let channel;
  let connecting;
  let lastError = null;

  const reset = () => {
    channel = null;
    connection = null;
    connecting = null;
  };

  const assertTopology = async (activeChannel) => {
    for (const queue of queues) {
      await activeChannel.assertQueue(queue.name, queue.options);
    }
  };

  const connect = async () => {
    connection = await amqp.connect(url);
    channel = await connection.createChannel();
    await assertTopology(channel);
    lastError = null;

    if (typeof connection.on === "function") {
      connection.on("close", reset);
      connection.on("error", (error) => {
        lastError = error;
      });
    }

    return channel;
  };

  return {
    async getChannel() {
      if (channel) return channel;
      if (!connecting) {
        connecting = connect().catch((error) => {
          lastError = error;
          reset();
          throw error;
        });
      }
      return connecting;
    },

    async checkStatus() {
      try {
        await this.getChannel();
        return { status: "connected" };
      } catch (error) {
        return {
          status: "unavailable",
          error: error.message,
        };
      }
    },

    getStatus() {
      return {
        status: channel ? "connected" : "unavailable",
        error: lastError?.message,
      };
    },

    async close() {
      const activeChannel = channel;
      const activeConnection = connection;
      reset();
      if (activeChannel) await activeChannel.close();
      if (activeConnection) await activeConnection.close();
    },
  };
};

module.exports = {
  createRabbitConnectionManager,
  getAmqplib,
  getRabbitUrl,
};
