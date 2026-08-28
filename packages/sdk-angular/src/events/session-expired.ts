import { Subject } from 'rxjs';

export class SessionExpiredEvents {
  private readonly subject = new Subject<void>();

  public readonly sessionExpired = this.subject.asObservable();

  public emit(): void {
    this.subject.next();
  }
}
