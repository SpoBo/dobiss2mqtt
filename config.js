module.exports = {
    dobiss: {
        // NOTE: this whole object maps to the first argument of socketInstance.connect
        host: '10.0.0.8',
        port: 10001
    },
    mqtt: {
        // TODO: Will need to properly map all params for mqtt.
        url: 'mqtt://10.0.0.2'
    },
    relays: [
        // first relay
        [
            // first output
            "berging",
            "koele_berging",
            "wc",
            "inkomhal",
            "inkomdeur",
            "salon",
            "eetplaats",
            "keuken",
            "terras",
            "badkamer",
            "master_bedroom",
            "dressing"
        ],
        // second relay
        [
            // first output
            "nachthal",
            "office",
            "fitness",
            "traphal",
            "zolder_1",
            "zolder_2",
        ]
    ]
}
