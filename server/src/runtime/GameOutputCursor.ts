export class GameOutputCursor {
  private position = -1;

  get after(): number {
    return this.position;
  }

  moveTo(seq: number): void {
    this.position = seq;
  }
}
