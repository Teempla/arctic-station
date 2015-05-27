Arctic Station
==============

## What it does

Arctic station is a realtime communications server written in nodejs that
scales well horizontally and can potentially hold thousands of connections.
The server was originally developed as a part of [Teempla](http://teempla.com) backend solution
and now being released as an open source project.

## How it works

Consider the following [scheme](https://app.teempla.com/viewer/public/7adf2148c87f949afb414fb6310a605c8ea16780/6). Users can be connected to one or multiple backend servers, i.e. if they open frontend app in multiple browser tabs. All application servers communicate with each other using [Redis](http://redis.io/topics/pubsub) publish/subscribe system. In the example above, if User A (connected to App Server 1) sends chat message to User B (connected to App Server 2), App Server 1 would check if there are any connections from User B (which there are none) and dispatch message to all other application servers subscribed to User B's redis private channel. App Server 2 receives User B's message from their private Redis channel and dispatches it to all current User B's connections.

## Work in progress

This is a work-in-progress technology that is currently being developed
and not ready for any production usage. Some (or most) parts of API are
going to be changed, replaced or removed and a lot of the code base is
being rewritten.

## Installation

Node modules:

```
npm install
```

## Configuration

Create one or more configuration files under ```src/configs``` dir:

```
default.conf
environment.conf
machine.conf
user.conf
```

Each next config file overrides values from previous ones.

For server to operate properly you'll need mongodb and redis connections.
Settings for these connections can be defined in config sections ```[mongo]```
and ```[redis]``` respectively.

## Startup

Running the server:

```
node src/server
```

## Documentation

Not yet available.

## Live Demo

Chat example is available at
