import { Subscription, Observable } from "rxjs"

export default class ObservableInspector {
    private unsubscribe: Subscription
    private done: boolean = false
    private nexted: any[] = []
    private err: any

    constructor(request$: Observable<any>) {
        this.unsubscribe = request$
            .subscribe({
                next: (item) => {
                    this.nexted.push(item)
                },
                error: (error) => {
                    this.err = error
                },
                complete: () => {
                    console.log('completing')
                    this.done = true
                }
            })
    }

    public stop() {
        this.unsubscribe.unsubscribe()
    }

    public get items() {
        return this.nexted
    }

    public get error() {
        return this.err
    }

    public get completed() {
        return this.done

    }
}
