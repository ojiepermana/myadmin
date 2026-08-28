import { Component, input } from '@angular/core';
import type { QueryCell, QueryExecution } from '@myadmin/sdk-angular';

type QueryStatement = QueryExecution['statements'][number];

/** Renders query statement outcomes behind a seam for the later result grid. */
@Component({
  selector: 'app-query-result-renderer',
  templateUrl: './query-result-renderer.html',
  styleUrl: './query-result-renderer.scss',
})
export class QueryResultRenderer {
  readonly statements = input<readonly QueryStatement[]>([]);

  protected cellValue(cell: QueryCell | undefined): string {
    if (!cell || cell.type === 'null') return 'NULL';
    return typeof cell.value === 'string' ? cell.value : String(cell.value);
  }

  protected cellClass(cell: QueryCell | undefined): string {
    if (!cell || cell.type === 'null') return 'text-muted-foreground italic';
    if (cell.type === 'number') return 'text-sky-700 dark:text-sky-300';
    if (cell.type === 'boolean') return 'text-violet-700 dark:text-violet-300';
    if (cell.type === 'bytes' || cell.type === 'json') return 'text-amber-700 dark:text-amber-300';
    return '';
  }
}
