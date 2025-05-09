# Dobiss 2 MQTT

This service needs to be pointed to a Dobiss CAN Programmer as well as an MQTT
server.

It will then expose your lights (outputs) as MQTT lights using the Home Assistant
discovery protocol.

For now this only supports:

* turning relay, dimmer & 0-10v outputs on/off
* dimming dimmer and 0-10v outputs to a specific percentage
* reading the state of outputs if relay, dimmer & 0-10v modules

It will set up a socket connection to the CAN Programmer. The intention is to
not have a permanent connection set up so that the regular dobiss app still
works nicely alongside this service. For the moment though the socket is always
connected. Which means that the native dobiss apps might encounter issues.

It will make a *lot* of requests to your CAN Programmer since it'll poll for
the state of every relay you have.

## Alternatives

https://github.com/VandenboschVincent/DobissConnector is an alternate implementation in .NET. It has a REST API and a small web UI to toggle switches.

## Config

See [data/config.js.example](data/config.js.example) for the main configuration. Rename it
to `config.js` and place it under the data folder.

There are also a couple of things which can be configured through an environment variable or through the config file.

| env                 | config key       | description                                                                                                                     | example         |
|---------------------|------------------|---------------------------------------------------------------------------------------------------------------------------------|-----------------|
| CONFIG_PATH         | -                | Where does the config.js file live.                                                                                             | /data/config.js |
| POLL_INTERVAL_IN_MS | pollIntervalInMs | To control the polling interval. Eg: the time between polling the output states on the modules in milliseconds.                 | 500             |
| MQTT_URL            | mqtt.urls        | URL for the MQTT broker                                                                                                         | mqtt://host     |
| DOBISS_HOST         | dobiss.host      | IP of your Dobiss IP Interface (CAN Programmer)                                                                                 | 192.168.0.2     |
| DOBISS_PORT         | dobiss.port      | Port of your Dobiss IP Interface (CAN Programmer)                                                                               | 10001           |
| DOBISS_INTERFACE    | dobiss.interface | Which type of Dobiss installation. See Dobiss Installation Types for the possibilities.                                         | ANBIANCEPRO     |
| -                   | modules          | The array of modules along with their outputs available on your dobiss installation. Needs to be configured in the config file. | -               |
| DEBUG               | -                | Control what gets logged. See debug npm package. Everything from dobiss2mqtt starts with 'dobiss2mqtt.'                         | *               |

## Dobiss Installation Types

I don't know all the protocols dobiss speaks. But this is a list of all the installations / systems there are. 
http://www.dobiss.com/nl/vorige-gammas as well as http://www.dobiss.com/nl/onze-oplossingen.

### SX Evolution
Set dobiss.interface to SXEVOLUTION

### SX Ambiance
Set dobiss.interface to SXAMBIANCE

Currently this is linked to the same protocol as SXEVOLUTION. This might not be working correctly.

SX has a dimmer range going from 0 to 10. So brightness changes in steps of 10%.

0-10v modules are not tested on this. If it works, let me know.

### Ambiance PRO
Set dobiss.interface to AMBIANCEPRO

### Evolution PRO
Set dobiss.interface to EVOLUTIONPRO

Currently this is linked to the same protocol as AMBIANCEPRO. This might not be working correctly.

0-10v modules are not tested on this. If it works, let me know.

### NXT
Set dobiss.interface to NXT.

Currently this is linked to the same protocol as AMBIANCEPRO. This might not be working correctly. Perhaps NXT also implements this older protocol. Let me know if this does not work.

It appears NXT works via a [new API](http://support.dobiss.com/books/nl-dobiss-nxt/page/developer-api) via REST and WebSockets. This is not implemented currently. If you have an NXT system, and are not affraid to dig into the code a little bit, reach out on the [home assistant community](https://community.home-assistant.io/t/dobiss2mqtt/192310) and we can help you integrate it.

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
    restart: unless-stopped
    volumes:
    - source: /tank/configs/dobiss2mqtt
      target: /data
      type: bind
```

## Development

Grab node which is defined in package.json -> volta.node.

Create a `config.js` file in the data folder based on the example file provided.

`npm i && npm run start` should get you up and running with ts-node-dev
executing the typescript code and restarting automatically when you make a change.

It will set the ENV of CONFIG_PATH to ./data/config.js so that it will load the
correct file.

It's set up to ignore reloading when the config.js file changes.

Make sure `npm run validate` passes.

Create a PR when stuff is working. I know that tests should be added to create a
good PR. I will look into refactoring the codebase a bit so that testing is
easier and everything is a bit more modular.

