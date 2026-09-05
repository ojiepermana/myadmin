# Evidence 2026-09-05. Drift pesan numerik pada provider integration test

**Date**: 2026-09-05
**Spec terkait**: [0038](../0038-data-browser-write/verify.md), [0057 AC-2](../0057-audit-remediation-wave-1/test.md#ac-2)
**Test ID**: `IT-0038-AC6`
**Sifat**: Perbaikan expectation test yang usang, bukan perubahan perilaku produksi

## Ringkasan

`IT-0038-AC6` gagal pada PostgreSQL dan MySQL nyata karena expectation-nya masih
mengharapkan pesan lama. Pekerjaan lossless numeric pada [spec 0057 AC-2](../0057-audit-remediation-wave-1/test.md#ac-2)
memecah keluarga numerik menjadi tiga jalur pada `numericParameter`, dan jalur
integer memakai pesan yang berbeda:

| Keluarga tipe                           | Sumber                                                                                    | Pesan                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| Integer (`int`, `bigint`, `serial`, …)  | `packages/database-mysql/src/data.ts:93`, `packages/database-postgresql/src/data.ts:115`  | `Column <name> expects a whole number`     |
| Exact numeric (`numeric`, `decimal`, …) | `packages/database-mysql/src/data.ts:98`, `packages/database-postgresql/src/data.ts:120`  | `Column <name> contains an invalid number` |
| Approximate (`float`, `double`, …)      | `packages/database-mysql/src/data.ts:102`, `packages/database-postgresql/src/data.ts:124` | `Column <name> contains an invalid number` |

Kedua test memakai kolom `id INT` / `id integer`, jadi jalur yang benar adalah
jalur integer. Expectation lama `Column id contains an invalid number` tidak
pernah lagi cocok sejak commit `c945868`.

Perilaku produksi benar dan tidak diubah. Yang diperbaiki hanya string
expectation pada dua file test.

## Mengapa drift ini tidak tertangkap

Kedua suite integration ditutup environment gate dan CI tidak menyetelnya:

- `tests/integration/mysql/provider.test.ts` hanya berjalan bila `MYSQL_8_0_URL`
  dan `MYSQL_LATEST_URL` keduanya terisi.
- `tests/integration/postgresql/provider.test.ts` hanya berjalan bila
  `MYADMIN_POSTGRES_INTEGRATION=1`.

Akibatnya perubahan pesan pada `c945868` lulus semua gate CI sementara dua
integration test yang di commit sebenarnya merah pada engine nyata.

## Bukti pra perbaikan

Reproduksi pada working tree sebelum perbaikan, MySQL 8.0.43 dan 8.4.6:

```text
Expected substring: "Column id contains an invalid number"
Received message: "Column id expects a whole number"
(fail) MySQL 8.0 > [IT-0038-AC6] ...
(fail) MySQL latest > [IT-0038-AC6] ...
 18 pass, 2 skip, 2 fail, 66 expect() calls
```

PostgreSQL 18.1 menunjukkan drift yang identik:

```text
Expected substring: "Column id contains an invalid number"
Received message: "Column id expects a whole number"
(fail) PostgreSQL provider integration > [IT-0038-AC6] ...
 14 pass, 1 fail, 49 expect() calls
```

Drift ini pra ada terhadap pekerjaan berjalan: dengan perubahan escape 0057 AC-1
di stash, kedua test gagal identik pada `780faf3`.

## Bukti pasca perbaikan

Environment: Bun 1.4.0, macOS Darwin 25.6.0, PostgreSQL 18.1/17.7 disposable
55433/55432, MySQL 8.0.43/8.4.6 disposable 3380/3384.

```text
MYSQL_8_0_URL=... MYSQL_LATEST_URL=... bun test tests/integration/mysql/provider.test.ts
 20 pass, 2 skip, 0 fail, 66 expect() calls   [755ms]
```

```text
MYADMIN_POSTGRES_INTEGRATION=1 bun test --isolate tests/integration/postgresql/provider.test.ts
 15 pass, 0 fail, 49 expect() calls   [649ms]
```

Dua skip pada MySQL adalah test security yang ditutup gate
`MYADMIN_MYSQL_SECURITY_INTEGRATION`.

## Temuan terpisah yang tidak diperbaiki di sini

Dengan `MYADMIN_MYSQL_SECURITY_INTEGRATION=1`, suite MySQL menghasilkan
**22 pass, 2 fail, 78 assertions**. Yang gagal adalah
`[IT-0046-AC1, IT-0046-AC2, IT-0046-AC3, IT-0046-AC4, IT-0046-AC6, IT-0046-AC7, SEC-0046-AC7]`
pada kedua engine:

```text
MySQLError: Access denied for user 'ma46_<uuid>'@'192.168.65.1' (using password: YES)
    errno: 1045, sqlState: "28000"
```

Kegagalan ini **bukan** akibat pekerjaan 0057. Diuji pada worktree terpisah di
`c945868^` (`abe2aa9`), hasilnya identik **22 pass, 2 fail**, jadi kegagalan ini
mendahului seluruh gelombang remediasi audit. Konsekuensinya klaim `SEC-0046-AC7`
pada [evidence 2026-08-29](2026-08-29-database.md) yang menyebut principal login
lulus tidak dapat direproduksi hari ini. Rekonsiliasi spec 0046 berada di luar
lingkup perubahan ini dan perlu pekerjaannya sendiri.

## Reproduksi

```bash
docker compose -f tests/environments/mysql/docker-compose.yml up -d
docker compose -f tests/environments/docker-compose.test.yml up -d
```

```bash
MYSQL_8_0_URL='mysql://root:myadmin-test-root@127.0.0.1:3380/fixture?sslmode=disable' \
MYSQL_LATEST_URL='mysql://root:myadmin-test-root@127.0.0.1:3384/fixture?sslmode=disable' \
bun test tests/integration/mysql/provider.test.ts
```

```bash
MYADMIN_POSTGRES_INTEGRATION=1 MYADMIN_POSTGRES_CURRENT_PORT=55433 \
MYADMIN_POSTGRES_PREVIOUS_PORT=55432 \
bun test --isolate tests/integration/postgresql/provider.test.ts
```
