+--------------------------+
| SoriBoard 2.0 / frontend |
+--------------------------+  
<a href="https://kit.svelte.dev/"><img src="https://img.shields.io/badge/Svelte-4A4A55?style=for-the-badge&logo=svelte&logoColor=FF3E00"/></a>

### Frontend of SNU Sorijigi time manager - SoriBoard 2.0

### WHAT IS SoriBoard 2.0?

SoriBoard 2.0 is an enhanced version of SoriBoard 1.3 which is on
"https://github.com/GTPV/time_manager_sorijigi/".  
SoriBoard 2.0 separated the frontend and backend of SoriBoard 1.3,
which was originally based on Django. The frontend of SoriBoard 2.0 is
based on Svelte, and the backend is based on Django REST framework.

### HOW TO RUN?

To run frontend only(which is this repository), run

```
  $ npm install
  $ npm run dev
```

To open the page in browser immediately, run

```
  $ npm run dev -- --open
```

### HOW TO TEST?

Pure helpers in `src/lib/` have unit tests in `tests/unit/` (Node's built-in
test runner, no extra dependency):

```
  $ node --test 'tests/unit/*.test.mjs'
```
