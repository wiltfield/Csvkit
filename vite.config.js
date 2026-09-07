import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        csvclean: resolve(__dirname, 'csvclean.html'),
        csvcreate: resolve(__dirname, 'csvcreate.html'),
        csvcut: resolve(__dirname, 'csvcut.html'),
        csvedit: resolve(__dirname, 'csvedit.html'),
        csvformat: resolve(__dirname, 'csvformat.html'),
        csvgrep: resolve(__dirname, 'csvgrep.html'),
        csvjoin: resolve(__dirname, 'csvjoin.html'),
        csvjson: resolve(__dirname, 'csvjson.html'),
        csvlook: resolve(__dirname, 'csvlook.html'),
        csvsort: resolve(__dirname, 'csvsort.html'),
        csvsql: resolve(__dirname, 'csvsql.html'),
        csvstack: resolve(__dirname, 'csvstack.html'),
        csvstat: resolve(__dirname, 'csvstat.html'),
        in2csv: resolve(__dirname, 'in2csv.html'),
        sql2csv: resolve(__dirname, 'sql2csv.html'),
      },
    },
  },
});
