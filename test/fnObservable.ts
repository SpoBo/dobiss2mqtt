import { Observable, Subscriber } from "rxjs";

export default function () {

    let sub: Subscriber<any>
    const control = {
        next(v: any) {
            sub.next(v)
        },
    }

    const fn = jest.fn((): Observable<any> => {
        return new Observable(function(subscriber) {
            sub = subscriber
        })
    })

    return {
        fn,
        control
    };
}
