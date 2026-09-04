# Relation 0057. Remediasi audit gelombang 1

**Date**: 2026-09-04
**Spec status**: mengikuti [index.md](index.md)
**Spec utama**: [index.md](index.md)
**Dokumen terkait**: [Test dan acceptance criteria](test.md) | [Verify](verify.md) | [Plan](plan.md) | [Rationale](rationale.md)

## Tujuan

Dokumen ini mencatat relasi yang memengaruhi urutan build, kontrak yang dikonsumsi, dan konsumen downstream.

## Legenda relasi

| Jenis         | Makna                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| `requires`    | Spec belum boleh dimulai sebelum dependency selesai.                                     |
| `references`  | Spec memakai keputusan atau istilah dari spec lain, tetapi bukan gerbang build langsung. |
| `enables`     | Spec lain menjadikan spec ini dependency langsung.                                       |
| `coordinates` | Perubahan perlu diselaraskan tanpa mengubah urutan build.                                |
| `deferred`    | Kewajiban sengaja diteruskan ke spec yang lebih akhir.                                   |
| `environment` | Kebutuhan layanan, runner, sertifikat, akun, atau resource manusia.                      |

## Prasyarat build

Tidak ada. Spec ini memperbaiki defect pada implementasi yang sudah ada, sehingga
seluruh dependensinya sudah terpasang.

## Relasi

| Jenis         | Spec                                                  | Alasan                                                                                                        |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `coordinates` | [0037](../0037-data-browser-read/index.md)            | AC-1 memperbaiki jalur filter dan search yang klaim verifikasinya menjadi tidak valid.                        |
| `coordinates` | [0038](../0038-data-browser-write/index.md)           | AC-2 mengubah koersi nilai pada jalur tulis.                                                                  |
| `coordinates` | [0045](../0045-database-security-principals/index.md) | AC-3 mengubah SQL principal MySQL dan menolak satu input yang sebelumnya diterima.                            |
| `coordinates` | [0049](../0049-backup/index.md)                       | AC-6 dan AC-7 mengubah environment subprocess dan argumen `mysqldump`.                                        |
| `coordinates` | [0050](../0050-restore/index.md)                      | AC-5 mengubah penyimpanan upload restore.                                                                     |
| `coordinates` | [0053](../0053-security-hardening/index.md)           | AC-6 memperluas standar redaction ke environment subprocess.                                                  |
| `coordinates` | [0002](../0002-quality-tooling-ci/index.md)           | AC-11 sampai AC-15 mengubah script test, gate lint, dan workflow.                                             |
| `references`  | [0056](../0056-bun-angular-runtime-standard/index.md) | AC-8 adalah langkah pertama AC-9 spec 0056; AC-10 memenuhi sebagian AC-19 spec 0056.                          |
| `deferred`    | [0056](../0056-bun-angular-runtime-standard/index.md) | Kernel HTTP penuh, pemecahan `app.ts`, dialect di core, dan `sdkResource()` tetap milik 0056 dan gelombang 2. |
| `deferred`    | [0011](../0011-credential-vault-redaction/index.md)   | SRV-3 ditugaskan ke gelombang 2 dan akan mengubah kebijakan redaction yang dimiliki spec ini.                 |
| `deferred`    | [0053](../0053-security-hardening/index.md)           | SRV-3 dan SRV-5 ditugaskan ke gelombang 2 dan menyentuh standar hardening pada spec ini.                      |
| `environment` | Layanan PostgreSQL dan MySQL disposable               | AC-1, AC-2, AC-3 butuh engine nyata untuk verdict penuh.                                                      |
| `environment` | Akses admin repository GitHub                         | AC-16 butuh proteksi branch yang tidak bisa dibuat dari dalam repo.                                           |
