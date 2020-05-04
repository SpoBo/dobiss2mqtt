import AmbiancePRO from './AmbiancePRO';

import { IRequestResponseBuffer } from '../rx-socket';
import { IDobiss2MqttModule, ModuleType } from '../config';

import ObservableInspector from '../test/ObservableInspector';
import fnObservable from '../test/fnObservable';

describe("protocols/AmbiancePRO", function() {

    describe("when we have a fake & controllable socket", function() {
        let client: IRequestResponseBuffer, clientControl: any;

        beforeEach(function() {
            const r = fnObservable()
            clientControl = r.control

            client = {
                request: r.fn,
            };
        })

        describe("when we have a fake config with 2 modules, 1 relay and other dimmer with 2 outputs on it each", function() {

            let modules: IDobiss2MqttModule[];
            beforeEach(function() {

                modules = [
                    {
                        type: ModuleType.relay,
                        address: 1,
                        outputs: [
                            {
                                name: "berging",
                                address: 0,
                                dimmable: false
                            },
                            {
                                name: "koele_berging",
                                address: 1,
                                dimmable: false
                            }
                        ]
                    },
                    {
                        type: ModuleType.dimmer,
                        address: 2,
                        outputs: [
                            {
                                name: "nachthal",
                                address: 0,
                                dimmable: true
                            },
                            {
                                name: "office",
                                address: 1,
                                dimmable: true
                            }
                        ]
                    },
                ]

            })

            describe("when we build our AmbiancePRO instance", function() {

                let instance: AmbiancePRO;
                beforeEach(function() {
                    instance = new AmbiancePRO({ socketClient: client })
                })

                describe("when we poll the first module", function() {
                    let result: ObservableInspector
                    beforeEach(function() {
                        const poll$ = instance
                            .pollModule(modules[0])

                        result = new ObservableInspector(poll$)
                    })

                    afterEach(function() {
                        result.stop()
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xAF,
                                0x01, // 1 for poll
                                0x08, // 8 for relay module
                                0x01, // 1 for module address
                                0x00,
                                0x00,
                                0x08,
                                0x01,

                                0x00,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xAF,
                            ])
                        )
                    });

                    describe("when we send a return message on the socket indicating the first output is off and the second one is on", function() {
                        beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0xaf,
                                        0x01,
                                        0x08,
                                        0x02,
                                        0x00,
                                        0x00,
                                        0x08,
                                        0x01,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xaf,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0x00,
                                        0x01,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff
                                    ])
                                )
                        })

                        test("it should have returned 2 messages indicating the first one is off and the second one is on", function() {
                            expect(result.items).toEqual([
                                {
                                    output: modules[0].outputs[0],
                                    powered: false
                                },
                                {
                                    output: modules[0].outputs[1],
                                    powered: true
                                },
                            ])
                        });

                        // NOTE: We need better control over the observables under test.
                        //       When we complete the observable we don't see it happening yet.
                        //       We probably need to wait for some kind of microqueue to complete.
                        test.skip("it should have completed the turn on request", function() {
                            expect(result.completed).toBeTruthy()
                        });
                    });
                });

                describe("when we poll the second module", function() {
                    let result: ObservableInspector
                    beforeEach(function() {
                        const poll$ = instance
                            .pollModule(modules[1])

                        result = new ObservableInspector(poll$)
                    })

                    afterEach(function() {
                        result.stop()
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xAF,
                                0x01, // 1 for poll
                                0x10, // for dimmer module
                                0x02, // 2 for module address
                                0x00,
                                0x00,
                                0x08,
                                0x01,

                                0x00,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xAF,
                            ])
                        )
                    });

                    describe('when we see a response indicating that output 1 is dimmed to a min of 1% and output 2 set to a max of 100', function() {
                        beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0xaf,
                                        0x01,
                                        0x08,
                                        0x02,
                                        0x00,
                                        0x00,
                                        0x08,
                                        0x01,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xaf,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0x01,
                                        0x64,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff
                                    ])
                                )
                        })

                        test('we should receive an output state of {1,powered,1%} and {2,powered,100%}', function() {
                            expect(result.items).toEqual([
                                {
                                    output: modules[1].outputs[0],
                                    powered: true,
                                    brightness: 1
                                },
                                {
                                    output: modules[1].outputs[1],
                                    powered: true,
                                    brightness: 100
                                },
                            ])
                        })
                    })


                    describe('when we see a response indicating that output 1 is dimmed to 50% and output 2 set to off', function() {
                        beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0xaf,
                                        0x01,
                                        0x08,
                                        0x02,
                                        0x00,
                                        0x00,
                                        0x08,
                                        0x01,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xaf,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0x32,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0x00,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff,
                                        0xff
                                    ])
                                )
                        })

                        test('we should receive an output state of {1,powered,1%} and {2,powered,100%}', function() {
                            expect(result.items).toEqual([
                                {
                                    output: modules[1].outputs[0],
                                    powered: true,
                                    brightness: 50
                                },
                                {
                                    output: modules[1].outputs[1],
                                    powered: false
                                },
                            ])
                        })
                    })
                });

                describe("when we ask to turn on the second output on the first module", function() {

                    let result: ObservableInspector
                    beforeEach(function() {
                        const on$ = instance
                            .on(modules[0], modules[0].outputs[1])

                        result = new ObservableInspector(on$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xAF,
                                0x02, // 2 for action
                                0x08, // for relay module
                                0x01, // 1 for module address
                                0x00,
                                0x00,
                                0x08,
                                0x01,

                                0x08,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xAF,

                                0x01, // module address
                                0x01, // output address
                                0x01, // power on
                                0xFF, // delay on
                                0xFF, // delay off
                                0x64, // dimmer max
                                0xFF, // dimmer speed
                                0xFF
                            ])
                        )
                    });

                    describe("when we return any response from the socket", function() {

                        beforeEach(function() {
                            // TODO: Figoure out the format of this response buffer.
                            //       Maybe there is some interesting information in here.
                            clientControl
                                .next(
                                    Buffer
                                        .from([
                                            175,
                                            2, // action
                                            8, // this was 8 in the original request.
                                            1, // module address
                                            0,
                                            0,
                                            8,
                                            1,
                                            8,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            175,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            1,
                                            7,
                                            1,
                                            255,
                                            255,
                                            64,
                                            255,
                                            255,
                                            255,
                                            2,
                                            55,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            255,
                                            2,
                                            55,
                                            255,
                                            255,
                                            255
                                        ])
                                )
                        })

                        test.skip("it should have completed the turn on request", function() {
                            expect(result.completed).toBeTruthy()
                        });
                    });
                });

                describe("when we ask to turn off the first output on the second module", function() {

                    let result: ObservableInspector
                    beforeEach(function() {
                        const off$ = instance
                            .off(modules[1], modules[0].outputs[0])

                        result = new ObservableInspector(off$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xAF,
                                0x02, // 2 for action
                                0x10, // for relay module
                                0x02, // 1 for module address
                                0x00,
                                0x00,
                                0x08,
                                0x01,

                                0x08,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xAF,

                                0x02, // module address
                                0x00, // output address
                                0x00, // power off
                                0xFF, // delay on
                                0xFF, // delay off
                                0x64, // dimmer max
                                0xFF, // dimmer speed
                                0xFF
                            ])
                        )
                    });

                    describe("when we return any response from the socket", function() {

                        test.todo("it should have completed the turn off request");

                    });

                });


                describe("when we ask to dim the first output on the second module to 50%", function() {

                    let result: ObservableInspector
                    beforeEach(function() {
                        const off$ = instance
                            .on(modules[1], modules[0].outputs[0], 50)

                        result = new ObservableInspector(off$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xAF,
                                0x02, // 2 for action
                                0x10, // for relay module
                                0x02, // 1 for module address
                                0x00,
                                0x00,
                                0x08,
                                0x01,

                                0x08,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xAF,

                                0x02, // module address
                                0x00, // output address
                                0x01, // power on
                                0xFF, // delay on
                                0xFF, // delay off
                                0x32, // dimmer max
                                0xFF, // dimmer speed
                                0xFF
                            ])
                        )
                    });

                });
            });
        });
    });
});

