# Earth Engine runbook

Run these at a conda prompt after `conda activate eo`. The account signed in must be your Earth Engine account; to switch, run `earthengine authenticate --force`.

These commands are for Command Prompt. In PowerShell, write `"$HOME\dev\..."` in place of `%USERPROFILE%\dev\...`.

## List all assets (read-only)

```bat
python %USERPROFILE%\dev\gee-backup\tools\inventory_assets.py ee-ahmadammargeo %USERPROFILE%\dev\gee-backup\ahmadammargeo\assets_inventory.csv projects/ee-assets projects/earthengine-legacy/assets/users/ahmadammargeo
```

## Export all assets to Google Drive

Dry run, which only checks:

```bat
python %USERPROFILE%\dev\gee-backup\tools\export_assets.py ee-ahmadammargeo %USERPROFILE%\dev\gee-backup\ahmadammargeo\assets_inventory.csv %USERPROFILE%\dev\gee-backup\ahmadammargeo\assets GEE_backup_ahmadammargeo
```

Start the exports:

```bat
python %USERPROFILE%\dev\gee-backup\tools\export_assets.py ee-ahmadammargeo %USERPROFILE%\dev\gee-backup\ahmadammargeo\assets_inventory.csv %USERPROFILE%\dev\gee-backup\ahmadammargeo\assets GEE_backup_ahmadammargeo --start
```

Rerunning skips tasks already started, using `assets/export_log.csv`. Follow progress in the Code Editor's Tasks tab. Originals are not changed.

## Afterwards

Download the Drive folder `GEE_backup_ahmadammargeo` into `dev\gee-backup\ahmadammargeo\assets\data`, which git ignores.

## Dependencies on other people's code

- `users/elacerda/geet`
- `users/ujavalgandhi/End-to-End-Projects` (course material; credit it when reused)
- `users/fitoprincipe/geetools`, `users/dmlmont/spectral`, `users/gena/packages` (imported by scripts)
