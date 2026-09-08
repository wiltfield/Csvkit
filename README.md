# Csvkit+

Csvkit+ is a browser-based JavaScript implementation of csvkit functionality, with additional tools and features for working with CSV and other tabular data.

The goal is simple: provide the useful parts of csvkit in a graphical interface, while adding functionality that is not available in the original project.

Everything in Csvkit+ is free to use.

## Features

### CSV tools

Csvkit+ includes browser-based versions of the following csvkit utilities:

- `in2csv`
- `csvclean`
- `csvcut`
- `csvformat`
- `csvgrep`
- `csvjoin`
- `csvjson`
- `csvlook`
- `csvsort`
- `csvsql`
- `csvstack`
- `csvstat`

The tools are presented as separate pages rather than command-line programs, so files can be selected and processed directly in the browser.

### Additional tools

#### csvedit

`csvedit` is a CSV editor built into Csvkit+.

It allows you to:

- Open a CSV file
- Edit individual cells
- Edit column names
- Add rows
- Add columns
- Remove rows and columns
- Work with the data in a table
- Save the edited CSV with a chosen filename
- Clear the current file and start again
- Undo changes
- Redo changes

The purpose of `csvedit` is to handle the kind of small changes that normally require opening a CSV in a spreadsheet application or manually editing the file.

#### csvcreate

`csvcreate` allows you to create a CSV file from scratch.

It includes:

- A spreadsheet-style grid
- Adding and removing rows
- Adding and removing columns
- Direct editing of cells
- A text mode for working directly with delimited data
- Switching between grid and text views
- Custom delimiters
- Saving the resulting CSV

This makes it possible to create a CSV without starting with an existing file.

## File conversion

`in2csv` can convert several types of tabular and structured data into CSV.

Supported input formats include:

- CSV
- TSV
- JSON
- NDJSON
- GeoJSON
- XLS
- XLSX
- ODS
- DBF
- Fixed-width text

Fixed-width files can be converted using a column schema.

ODS support is one of the additions made in Csvkit+. The original csvkit `in2csv` does not list ODS as a supported input format.

## What is different from csvkit?

Csvkit+ is not a wrapper around the original csvkit program and does not call, embed, or depend on it in any way. It is an independent JavaScript codebase that reimplements the same category of functionality from scratch so it can run entirely in the browser, with no Python installation or server-side csvkit process involved.

The following are additions made specifically for Csvkit+:

- **Graphical interface**
- **csvedit**
- **csvcreate**
- **ODS input support**
- **Browser-based file handling**
- **Drag and drop file input**
- **Editable tabular output**
- **Undo and redo in csvedit**
- **Automatic draft saving and restoration**
- **Light and dark themes**
- **Browser-based file downloads**
- **Grid and text editing modes in csvcreate**
- **Custom delimiter support in csvcreate**
- **Client-side processing for supported operations**

## Working with files

Files are processed through the web application rather than being uploaded to a separate csvkit installation.

For operations that work locally in the browser, the file can be selected from the device or dragged into the application.

Processed data can then be downloaded as a new file.

## Draft saving

Csvkit+ can save working drafts locally in the browser.

This is useful when working on an operation and accidentally leaving or refreshing the page. Where supported, the application can restore the previous working state.

Drafts are stored locally in the user's browser.

## Themes

The interface supports dark and light themes.

The selected theme is saved locally so it can be retained between visits.

## Browser support

Csvkit+ is designed to run in a modern web browser with JavaScript enabled.

No Python installation or separate csvkit installation is required to use the web application.

## Project structure

The project is organized around individual pages and JavaScript modules.

```text
Csvkit-plus/
├── public/
├── src/
├── netlify/
│   └── functions/
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
├── package.json
├── vite.config.js
└── README.md
```

## Privacy

Csvkit+ is designed around processing files in the browser where possible.

Files selected for local processing are not intended to be uploaded simply because they are being processed by the application.

Users should still avoid putting sensitive information into any online service unless they understand how that particular operation works.

## Free to use

Csvkit+ is free to use.

There are no paid features in the application. A donation option is available for anyone who wants to support the project.

Donations help cover development costs and help fund other projects that are currently paused due to lack of funds.

## License

**Csvkit+ is proprietary software. It is not open source.**

- All rights are reserved. No permission is granted to copy, modify, redistribute, sell, sublicense, or create derivative works from this software, in whole or in part, unless explicitly stated otherwise in writing by the project owner.
- The source code is publicly visible on GitHub for transparency and reference only. Public visibility of the repository does not constitute an open-source license and does not grant any usage rights.
- There is no license file in this repository granting rights to third parties. Absence of a license means no rights are granted beyond viewing the code.
- Cloning or downloading this repository does not grant any right to run, build, modify, or redistribute the software.

Csvkit+ is an independent project and is not the csvkit project itself, not affiliated with it, and not endorsed by it.

## Acknowledgements

Csvkit+ is based on the functionality and ideas provided by the [csvkit](https://github.com/wireservice/csvkit) project, an open source Python toolkit for working with CSV and tabular data. csvkit's command-line utilities provided the conceptual foundation for the set of operations implemented in Csvkit+.

Csvkit+ does not reuse csvkit's source code. All functionality is reimplemented independently in JavaScript for the browser.

See the [csvkit repository](https://github.com/wireservice/csvkit) and [csvkit documentation](https://csvkit.readthedocs.io/) for the original project.

## Status

Csvkit+ is an active project.

Features may continue to be added and existing tools may be improved over time.
