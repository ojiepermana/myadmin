# Test 0056. Standar runtime Bun dan reaktivitas Angular

Sumber acceptance criteria kanonis berada pada [index.md](index.md). File ini memetakan bukti yang harus dibuat setelah setiap child mulai dibangun. Belum ada test yang diklaim lulus dari spec ini.

## Acceptance matrix

| Test id    | Acceptance | Bukti yang dibutuhkan                                                                                                    |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `S0056-01` | AC-1       | Review setiap child memiliki canonical pattern, replaces, enforcement, rollout, dan exceptions                           |
| `S0056-02` | AC-2       | Typecheck, boundary check, Bun runtime test, provider integration test, dan I/O streaming test                           |
| `S0056-03` | AC-3       | Test AbortSignal, timeout config, provider cancel, race, retry, dan terminal state                                       |
| `S0056-04` | AC-4       | Composition test production dan fixture, cleanup idempotency, timer serta WebSocket shutdown                             |
| `S0056-05` | AC-5       | OpenAPI lint, generated contract, route registry, SDK typecheck, event contract, dan v1 v2 contract test sebelum cutover |
| `S0056-06` | AC-6       | Angular build, focused DOM runner, resource lifecycle test, zoneless feature gate, dan Playwright browser test           |
| `S0056-07` | AC-7       | Authorization, CSRF, owner boundary, admin audit observation, redaction, audit event, dan correlation id test            |
| `S0056-08` | AC-8       | Release target smoke, no regression measurement, evidence matrix, exception register, dan cutover gate                   |
| `S0056-09` | AC-9       | Operation schema, idempotency, retention, restart outcome, cancel race, dan synchronous explain contract test            |
| `S0056-10` | AC-10      | WebSocket version binding, reconnect, I/O shutdown, partial write cleanup, Angular read state, dan accessibility test    |

## Required scenarios

1. Query execution berhenti pada provider nyata saat AbortSignal dibatalkan, dan state akhir menjadi `cancelled` atau `failed` sesuai hasil provider, menguji `S0056-03`.
2. Cancel dua kali dan retry command dengan `Idempotency-Key` tidak membuat operation kedua, menguji `S0056-03` serta `S0056-05`.
3. Header version tidak dikenal ditolak, header v2 memakai operation resource, dan request tanpa header mengikuti aturan fase migrasi, menguji `S0056-05`.
4. User lain ditolak membaca atau membatalkan operation, owner dapat mengakses miliknya, dan admin hanya mengamati metadata melalui audit, menguji `S0056-07`.
5. Resource Angular menampilkan loading, ready, empty, error, refreshing, dan stale secara benar pada zoneless, dengan `aria-busy`, live region, focus, dan secret redaction, menguji `S0056-06` serta `S0056-10`.
6. Asset besar disajikan sebagai stream dan log tidak menulis sync pada request path yang sudah dimigrasikan, menguji `S0056-02`.
7. Contract fixture memakai module factory yang sama dengan production dan cleanup tidak meninggalkan timer, socket, atau provider, menguji `S0056-04`.
8. Setiap exception entry memiliki alasan, dampak, owner, test, dan review date, menguji `S0056-01` serta `S0056-08`.
9. Operation terminal disimpan sesuai retention matrix, hilang setelah restart dengan error aman, retry memakai key yang sama mengembalikan snapshot yang sama, dan body berbeda ditolak, menguji `S0056-09`.
10. WebSocket menolak version mismatch, mengulang version saat reconnect, shutdown menutup stream dan menghapus partial artifact, serta explain tetap sinkron, menguji `S0056-09` serta `S0056-10`.

## Honest evidence rule

Test unit atau build yang lulus pada host developer tidak membuktikan database nyata, browser, binary target, atau provider cancellation. Evidence untuk hal tersebut harus berasal dari environment yang sesuai dan tetap `blocked` bila environment belum tersedia.
