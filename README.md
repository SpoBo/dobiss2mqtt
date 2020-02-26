# Dobiss 2 MQTT

This service needs to be pointed to a Dobiss CAN Programmer as well as an MQTT
server.

It will then expose your lights as MQTT lights using the Home Assistant
discovery protocol.

For now this only supports basic lights since I'm a cheap bastard and I only have
lights & switches on the dobiss system. No dimmers. No programs. No moods. If
you want it, add it yourself or pay my electrician to come and install those
things so I can play with it.

It will set up a socket connection to the CAN Programmer. The intention is to
not have a permanent connection set up so that the regular dobiss app still
works nicely alongside this service. For the moment though the socket is always
connected. Which means that the native dobiss apps might encounter issues.

It will make a *lot* of requests to your CAN controller since it'll poll for
the state of every relay you have.

## Config

See [data/config.js.example](data/config.js.example) for the main configuration. Rename it
to `config.js` and place it under the data folder when using docker.

There are also a couple ENV overrides

To control the polling interval:
POLL_INTERVAL_IN_MS=500

To control where the config.js file is located:
CONFIG_PATH=/data/config.js

## Installation

### Docker

Here's an example config. Make sure to mount your data folder containing the
config.js file.

``` yaml
version: '3.5'

services:
  dobiss2mqtt:
    container_name: dobiss2mqtt
    image: vincentds/dobiss2mqtt:latest
    restart: always
    networks:
      - internal
    volumes:
    - read_only: true
      source: /etc/localtime
      target: /etc/localtime
      type: bind
    - source: /tank/configs/dobiss2mqtt
      target: /data
      type: bind
    labels:
      - "com.centurylinklabs.watchtower.enable=true"
```

## Development

Grab node which is defined in package.json -> volta.node.

Create a `config.js` file in the data folder based on the example file provided.

`npm i && npm run start` should get you up and running with ts-node-dev
executing the typescript code and restarting automatically when you make a change.

It will set the ENV of CONFIG_PATH to ../data/config so that it will load the
correct file.

It's set up to ignore reloading when the config.js file changes.

Make sure `npm run validate` passes.

Create a PR when stuff is working. I know that tests should be added to create a
good PR. I will look into refactoring the codebase a bit so that testing is
easier and everything is a bit more modular.

