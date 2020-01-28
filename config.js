module.exports = {
    dobiss: {
        ip: '10.0.0.8',
        port: 10001
    },
    mqtt: {
        url: '10.0.0.2'
    },
    exits: [
        [
            "berging", // 1.1
            "koele_berging", // 1.2
            "wc", // 1.3
            "inkomhal", // 1.4
            "inkomdeur", // 1.5
            "salon", // 1.6
            "eetplaats", // 1.7
            "keuken",
            "terras",
            "badkamer",
            "master_bedroom",
            "dressing"
        ],
        [
            "nachthal", // 2.1
            "fitness",
            "office",
            "traphal",
            "zolder_1",
            "zolder_2",
        ]
    ]
}

const switches = [
    [
        "nachthal_stairs_left",
        "nachthal_stairs_right",
        "nachthal_end_left",
        "nachthal_end_right",
        "office",
        "fitness",
        "master_bedroom",
        "dressing",
        "nachthal_zolder",
        "zolder_1",
        "zolder_2"
    ],
    [
        "berging",
        "koele_berging",
        "traphal_beneden",
        "keuken_left_top",
        "keuken_right_top",
        "keuken_right_bottom",
        "keuken_left_bottom",
        "dinner_left_top",
        "dinner_right_top",
        "dinner_right_bottom",
        "dinner_left_top",
        "salon_left",
        "salon_right",
        "inkomhal_single",
        "inkomhal_left",
        "inkomhal_right",
        "toilet",
        "kitchen_counter",
        "bathroom"
    ]
]
