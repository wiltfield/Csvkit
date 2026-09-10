# Csvkit+

Csvkit+ is a browser-based JavaScript toolkit for working with CSV, tabular data, and SQL databases.

It brings the core functionality of [csvkit](https://github.com/wireservice/csvkit) into a graphical web interface while adding tools and quality-of-life features that are not part of the original project.

Everything in Csvkit+ is free to use.

## Features

### CSV and tabular data tools

Csvkit+ provides browser-based implementations of the following csvkit utilities:

* `in2csv`
* `csvclean`
* `csvcut`
* `csvformat`
* `csvgrep`
* `csvjoin`
* `csvjson`
* `csvlook`
* `csvsort`
* `csvsql`
* `csvstack`
* `csvstat`

Files can be selected directly from your device or dragged into the application.

### Additional tools

#### csvedit

A full CSV editor for making changes directly in the browser.

* Edit individual cells
* Rename columns
* Add and remove rows
* Add and remove columns
* Undo and redo changes
* Save the edited CSV with a custom filename
* Clear the current file
* Automatically restore unfinished work

#### csvcreate

Create a CSV from scratch without starting with an existing file.

* Spreadsheet-style editing grid
* Add and remove rows
* Add and remove columns
* Direct cell editing
* Grid mode and text mode
* Switch between grid and text views
* Custom delimiters
* Undo and redo
* Save the resulting CSV
* Automatic draft saving and restoration

#### sql2csv

Run SQL queries against a connected database and save the results as CSV.

* Connect to PostgreSQL, CockroachDB, MySQL, or MariaDB
* Select the connection dialect before connecting
* Enter and run SQL queries
* Browse database tables
* View table columns and data types
* Select tables directly from the schema browser
* Build a stack of multiple tables
* Run stacked tables as a combined result
* Save query results as CSV
* Rename and remove saved database connections

## csvsql

`csvsql` converts CSV data into SQL `CREATE TABLE` and `INSERT` statements.

It has two modes.

### Generate SQL

Generate SQL without connecting to a database.

Csvkit+ supports **18 SQL dialects** for generated SQL output:

**Common**

* PostgreSQL
* MySQL
* MariaDB
* SQLite
* SQL Server
* Oracle

**Other csvkit dialects**

* Firebird
* Sybase (SAP ASE)
* CrateDB
* Microsoft Access
* Informix
* SAP MaxDB

**Csvkit+ additions**

* CockroachDB
* Snowflake
* Google BigQuery
* Amazon Redshift
* DuckDB
* ClickHouse

Generated SQL can be:

* Copied directly to the clipboard
* Saved as a `.sql` file
* Generated for a custom table name

### Connect and push to a database

Csvkit+ also supports directly inserting generated CSV data into connected databases.

Live database connections currently support:

* PostgreSQL
* CockroachDB
* MySQL
* MariaDB

Once connected, CSV data can be pushed to the selected database directly from `csvsql`.

## Database connection manager

Csvkit+ includes a reusable database connection manager shared by `csvsql` and `sql2csv`.

You can:

* Add database connections
* Give connections custom names
* Rename connections
* Remove connections
* Switch between saved connections from a dropdown
* Keep multiple database connections available at the same time
* Select the active database independently of the other saved connections
* Automatic dialect verification on connect, with an error shown if the selected dialect does not match the connected database

There is **no built-in limit on the number of saved database connections**.

Connections are stored locally in the browser and can be reused across `csvsql` and `sql2csv`.

## File conversion

`in2csv` converts supported structured and tabular formats into CSV.

Supported input formats include:

* CSV
* TSV
* JSON
* NDJSON
* GeoJSON
* XLS
* XLSX
* ODS
* DBF
* Fixed-width text

Fixed-width files can be converted using a column schema.

ODS support is an additional Csvkit+ feature not listed as an input format for the original csvkit `in2csv`.

## Browser-based processing

Csvkit+ is designed to perform supported file operations directly in the browser.

This includes:

* Local file selection
* Drag and drop
* Client-side processing
* Browser-based downloads
* Web Workers for supported processing tasks
* Editable tabular output
* Local draft saving
* A live status display showing the current state of each operation as it runs
* Undo and redo on csvcut, csvgrep, csvsort, csvjoin, csvstack, csvclean, csvedit, and csvcreate
* A Clear file option to reset a tool back to a blank state and remove its saved draft

No Python installation or separate csvkit installation is required.

## Drafts and session recovery

Several tools automatically save unfinished work locally in the browser.

If a page is refreshed or accidentally left, the application can restore the previous working state where supported.

Drafts are stored locally using browser storage.

## Themes

Csvkit+ supports:

* Dark mode
* Light mode

The selected theme is saved locally and restored on future visits.

## Privacy

Csvkit+ processes supported files locally in the browser rather than uploading them to a separate csvkit server.

Database functionality is different. `csvsql` and `sql2csv` use the application's database relay to test connections, execute queries, retrieve schemas, and insert data into supported databases.

Saved database connection information is stored locally in the browser.

Do not use a database connection with credentials you are not comfortable entering into a web application.

## Csvkit+ vs csvkit

Csvkit+ is an independent JavaScript implementation.

It does not:

* Wrap the original csvkit application
* Execute the original csvkit program
* Require Python
* Require a local csvkit installation
* Reuse csvkit's source code

Instead, Csvkit+ independently reimplements functionality from the same category in JavaScript for a browser-based interface.

In addition to the core csvkit-inspired tools, Csvkit+ adds features including:

* Graphical interface
* `csvedit`
* `csvcreate`
* `sql2csv`
* ODS input support
* 18 SQL output dialects
* CockroachDB support
* Snowflake support
* BigQuery support
* Amazon Redshift support
* DuckDB support
* ClickHouse support
* Direct database insertion
* Multiple saved database connections
* Database connection naming and renaming
* Database connection switching
* Database schema browsing
* Multi-table stacking in `sql2csv`
* Drag and drop file handling
* Editable tabular output
* Undo and redo
* Automatic draft saving and restoration
* Light and dark themes
* Browser-based file downloads
* Grid and text modes in `csvcreate`
* Custom delimiters in `csvcreate`
* Client-side processing for supported file operations

## Browser support

Csvkit+ is designed for modern web browsers with JavaScript enabled.

No Python installation or separate csvkit installation is required.

## Project structure

The project is organized into individual tool pages and reusable JavaScript modules.

```text
Csvkit-plus/
├── api/
├── public/
├── src/
│   ├── csv-worker.js
│   ├── in2csv-worker.js
│   ├── csvclean.js
│   ├── csvcreate.js
│   ├── csvcut.js
│   ├── csvedit.js
│   ├── csvformat.js
│   ├── csvgrep.js
│   ├── csvjoin.js
│   ├── csvjson.js
│   ├── csvlook.js
│   ├── csvsort.js
│   ├── csvsql.js
│   ├── csvstack.js
│   ├── csvstat.js
│   ├── db-connection.js
│   ├── download.js
│   ├── draft-storage.js
│   ├── editable-grid.js
│   ├── history.js
│   ├── in2csv.js
│   ├── script.js
│   ├── sql2csv.js
│   ├── style.css
│   └── terminal.js
├── index.html
├── in2csv.html
├── csvclean.html
├── csvcut.html
├── csvformat.html
├── csvgrep.html
├── csvjoin.html
├── csvjson.html
├── csvlook.html
├── csvsort.html
├── csvsql.html
├── csvstack.html
├── csvstat.html
├── csvedit.html
├── csvcreate.html
├── sql2csv.html
├── about.html
├── donate.html
├── package.json
├── vite.config.js
└── README.md
```

## Free to use

Csvkit+ is free to use.

There are currently no paid features in the application.

A donation option is available for users who want to support continued development and help fund future projects.

## License

**Csvkit+ is proprietary software. It is not open source.**

All rights are reserved. No permission is granted to copy, modify, redistribute, sell, sublicense, or create derivative works from this software, in whole or in part, unless explicitly stated otherwise in writing by the project owner.

The source code is publicly visible on GitHub for transparency and reference only. Public visibility of the repository does not constitute an open-source license and does not grant any usage rights.

There is no license file in this repository granting rights to third parties. Absence of a license means no rights are granted beyond viewing the code.

Csvkit+ is an independent project and is not affiliated with, endorsed by, or operated by the csvkit project.

## Acknowledgements

Csvkit+ is based on the functionality and ideas provided by the [csvkit](https://github.com/wireservice/csvkit) project, an open source Python toolkit for working with CSV and tabular data.

csvkit's command-line utilities provided the conceptual foundation for many of the operations implemented in Csvkit+.

Csvkit+ does not reuse csvkit's source code. The functionality is independently implemented in JavaScript.

For the original project, see the [csvkit repository](https://github.com/wireservice/csvkit) and [csvkit documentation](https://csvkit.readthedocs.io/).

## Status

Csvkit+ is an active project.

New features and improvements may continue to be added over time.
