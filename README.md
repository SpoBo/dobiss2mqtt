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
works nicely alongside this service.

But it will make a *lot* of requests to your CAN controller since it'll poll for
the state of the lights almost continuously.

## Config

## Development

I am under the assumption that every request receives a single response.

I notice that a single CAN Programmer can only have a single
active socket session. The Dobiss app also uses a socket connection to check the
states of the lights. So it's important to not hog the socket connection if it's
not needed. That said, it's kind of needed because we need to constantly ping
the CAN Programmer to check the state of the relay outputs.

It will use RxJS internally because RxJS is noice.

Here's how it should work internally:

- We have a queue of requests
- Requests are executed in sequence and the next request is not picked up until
  the previous one completed.
- A request is only considered complete if we received a response or if we
  received a timeout.
- There are 2 different requests for now.
  - Sending an action to a relay output (on, off, toggle)
  - Polling a relay for all the output states
- Every relay is mapped with every output on it in the config.
- The system will build up an internal state for every output and initialize it
  to unknown.
- The system will start polling every relay at a set interval for the relay
  output states.
- For every relay's state response we will push a new value for internal output
  states.
- The MQTT will consume these internal output states and expose the state
  whenever there is a change.
- The MQTT will send auto discovery messages for every relay output it has configured.
- The MQTT will listen for requests to turn on/off lights and send the necessary
  requests to the CAN Programmer.
- The next ping of the relay states will pick up the changed state and the relay
  output's new state should be emitted to MQTT.
- Whenever the socket is not in use, it will be closed. And re-opened again when
  it is needed.
- We will keep the socket open if there is a subsequent request -> like checking
  the state of a second relay.
- When switching the state of an output, we will immediately queue the relay in
  question to be checked.
- We will have a set interval at which we check the relays. However, we will
  increase the interval if we have a high error rate.
- An error is a timeout or the inability to set up a connection.
