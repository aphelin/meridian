/** Injectable time source so expiry and deadlines are testable. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol("CLOCK");

export class SystemClock implements Clock {
  now() {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now() {
    return new Date(this.current);
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date) {
    this.current = new Date(date);
  }
}
