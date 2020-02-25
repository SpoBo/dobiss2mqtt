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
connected.

It will make a *lot* of requests to your CAN controller since it'll poll for
the state of every relay you have.

## Config

See config.js.example.

## Development

Grab node v13.x.

`npm i && npm run start` should get you up & running with ts-node.
