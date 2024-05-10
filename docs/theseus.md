Some random metrics

find . -name "*.js" -print | xargs wc -l 
154,874 lines of javascript

900 node_modules at the top level

find . -type f -name "*.js" | cut -d"/" -f2 | uniq -c
22297 node_modules
   1 index.js
   1 styles
   2 scripts
 154 lib
