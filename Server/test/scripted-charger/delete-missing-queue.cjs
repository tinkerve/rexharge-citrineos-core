#!/usr/bin/env node
// REX-96: checks that deleting a queue that does not exist leaves the AMQP channel usable.
//
// The router deletes a station's remembered queues on every connect. If the broker already dropped
// one of them, AMQP 0-9-1 would answer queue.delete with a 404 channel error and close the channel
// that every station consumer shares. RabbitMQ documents queue.delete of a missing queue as a no-op;
// this script proves it on the rig's broker.
//
// Usage: node Server/test/scripted-charger/delete-missing-queue.cjs   (exit 0 = channel survived)
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '../..', '..');
const amqplib = require(require.resolve('amqplib', { paths: [repoRoot] }));
const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';

(async () => {
  const conn = await amqplib.connect(AMQP_URL);
  const channel = await conn.createChannel();
  let channelClosed = false;
  channel.on('close', () => (channelClosed = true));
  channel.on('error', (e) => console.log('channel error:', e.message));

  const missing = `rex96-missing-${crypto.randomBytes(4).toString('hex')}`;
  const result = await channel.deleteQueue(missing);
  console.log(`deleteQueue(${missing}) ->`, JSON.stringify(result));

  // Use the same channel again: this fails if the delete closed it.
  const { queue } = await channel.assertQueue('', { exclusive: true, autoDelete: true });
  await channel.checkQueue(queue);
  await channel.deleteQueue(queue);
  const survived = !channelClosed;
  console.log(`same channel still works afterwards: ${survived ? 'PASS' : 'FAIL'}`);
  await conn.close();
  process.exit(survived ? 0 : 1);
})().catch((e) => {
  console.log('FAILED:', e.message);
  process.exit(1);
});
