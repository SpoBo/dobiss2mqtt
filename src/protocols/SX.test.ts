import SX from './SX';

import { IRequestResponseBuffer } from '../rx-socket';
import { IDobiss2MqttModule, ModuleType } from '../config';

import ObservableInspector from '../test/ObservableInspector';
import fnObservable from '../test/fnObservable';
import { from } from 'rxjs';

describe("protocols/SX", function() {

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
                                dimmable: false,
                            },
                            {
                                name: "koele_berging",
                                address: 1,
                                dimmable: false,
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
                                dimmable: true,
                            },
                            {
                                name: "office",
                                address: 1,
                                dimmable: true,
                            }
                        ]
                    },
                ]

            })

            describe("when we build our SX instance", function() {

                let instance: SX;
                beforeEach(function() {
                    instance = new SX({ socketClient: client, modules$: from(modules) })
                })

                describe("when we poll the first module", function() {
                    let result: ObservableInspector
                    beforeEach(function() {
                        const poll$ = instance
                            .pollModule(1)

                        result = new ObservableInspector(poll$)
                    })

                    afterEach(function() {
                        result.stop()
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x63,
                                0x30,
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
                                0xAF,
                                0xAF,

                                // output 1
                                0x41,
                                0x00,
                                // output 2
                                0x41,
                                0x01,

                                // filler to get to 24 outputs to check
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF
                            ])
                        )
                    });

                    describe("when we send a return message on the socket indicating the first output is off and the second one is on", function() {
                        beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0x00,
                                        0x01,

                                        // and the filler stuff ...
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
                                        0xFF,
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


                    describe("when we send a return message on the socket indicating the second output is off and the first one is on", function() {
                        beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0x01,
                                        0x00,
                                    ])
                                )
                        })

                        test("it should have returned 2 messages indicating the first one is off and the second one is on", function() {
                            expect(result.items).toEqual([
                                {
                                    output: modules[0].outputs[0],
                                    powered: true
                                },
                                {
                                    output: modules[0].outputs[1],
                                    powered: false
                                },
                            ])
                        });
                    });
                });

                describe("when we poll the second module", function() {
                    let result: ObservableInspector
                    beforeEach(function() {
                        const poll$ = instance
                            .pollModule(2)

                        result = new ObservableInspector(poll$)
                    })

                    afterEach(function() {
                        result.stop()
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x63,
                                0x30,
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
                                0xAF,
                                0xAF,

                                // output 1
                                0x42,
                                0x00,
                                // output 2
                                0x42,
                                0x01,

                                // filler to get to 24 outputs to check
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF,
                                0xFF
                            ])
                        )
                    });

                    describe('when we return with a state indicating the first output is off and the second one is on', function() {
                         beforeEach(function() {
                            return clientControl
                                .next(
                                    Buffer.from([
                                        0x10,
                                        0x00,
                                    ])
                                )
                        })

                        test("it should have returned 2 messages indicating the first one is off and the second one is on", function() {
                            expect(result.items).toEqual([
                                {
                                    output: modules[1].outputs[0],
                                    powered: true,
                                    level: 1
                                },
                                {
                                    output: modules[1].outputs[1],
                                    powered: false,
                                    level: 0
                                },
                            ])
                        });
                    })
                });

                describe("when we ask to turn on the second output on the first module", function() {

                    let result: ObservableInspector
                    beforeEach(function() {
                        const on$ = instance
                            .on(1, 1)

                        result = new ObservableInspector(on$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x43,
                                0x31,
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
                                0xAF,
                                0xAF,

                                0x41, // module
                                0x01, // second output
                                0x01, // turn on
                            ])
                        )
                    });

                    describe("when we return any response from the socket", function() {

                        beforeEach(function() {
                            clientControl
                                .next(
                                    Buffer
                                        .from([ 175,
                                                2,
                                                null,
                                                1,
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
                        const on$ = instance
                            .off(2, 0)

                        result = new ObservableInspector(on$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x43,
                                0x31,
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
                                0xAF,
                                0xAF,

                                0x42, // second module
                                0x00, // first output
                                0x00, // turn off
                            ])
                        )
                    });

                    describe("when we return any response from the socket", function() {

                        test.todo("it should have completed the turn off request");

                    });

                });

                describe('when we ask to dim the first output of the second module to 50%', function() {

                    let result: ObservableInspector
                    beforeEach(function() {
                        const on$ = instance
                            .on(2, 0, 5)

                        result = new ObservableInspector(on$)
                    })

                    test("it should have sent the correct request to the socket", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x43,
                                0x31,
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
                                0xAF,
                                0xAF,

                                0x42, // second module
                                0x00, // first output
                                0x32, // turn on to 50%
                            ])
                        )
                    });
                })


                describe('when we ask to dim the first output of the second module to 20%', function() {
                    let result: ObservableInspector
                    beforeEach(function() {
                        const on$ = instance
                            .on(2, 0, 2)

                        result = new ObservableInspector(on$)
                    })

                    test("it should have sent the correct request to the socket to dim to 20", function() {
                        expect(client.request).toHaveBeenCalledWith(
                            Buffer.from([
                                0xED,
                                0x43,
                                0x31,
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
                                0xAF,
                                0xAF,

                                0x42, // second module
                                0x00, // first output
                                0x14, // turn on to 20
                            ])
                        )
                    });
                })

            });
        });
    });
});
