//Basic JavaScript Syntax 

// Hello World!
print('Hello World!');

// Basic JavaScript data types

// 1. Strings

// Use single (or double) quotes to make a string.
var testString = "Google Earth Engine!";

// Use parentheses to pass arguments to functions.
print(testString);

// Built-in properties
print(testString.length);

// Built-in methods
print(testString.toUpperCase());

// 2. Numbers
// Store a number in a variable.
var number = 99;
print('My answer is:', number);

// 3. Lists
var myList = [0, 1, 2, 3, 4, 5];
print('List of numbers:', myList);

// Make a list of strings.
var myListStrings = ['x', 'y', 'z'];
print('My list of strings:', myListStrings);

// 4. Objects
var myObject = {
  aby: 'try',
  nota: 13,
  item: ['county', 'zone', 'country']
};
print('Dictionary:', myObject);

// Access dictionary items using square brackets.
print('Print aby:', myObject['aby']);

// Access dictionary items using dot notation.
print('Print item:', myObject.item);

// 5. Functions
var test = function(element) {
  // Return the argument.
  return element;
};

function calc(a,b) {
  print (a + b);
  print (a - b);
  print (a / b);
  print (a * b);
}
calc(3,4);

// 6. Compound Assignment Operators
var x = 3;
x = x + 1;
print (x);

var x = 3;
x += 1;
print (x);

// 7. If and Else (using comparison operators)
var age = 20;
if( age > 18 ) {
  print("Qualifies for driving");
}
 
var age = 20;
if( age > 18 ) {
  print("Qualifies for driving");
} else {
  print("Does not qualify for driving");
}

// Similarly, you can also use other operators like == for checking if both sides are equal

// 8. Conditional and logical operators
// Ternary Operator
var voteable = (age < 18) ? "Too young" : "Old enough"; 
print(voteable);

// Logical Operators
var x = 6;
var y = 3;

print (x < 10 && y > 1);
print (!(x < 10 || y < 1));

// Similarly, you can also use || for OR and ! for NOT

// 9. Loops
// For Loop
print("Starting Loop" + "");
for(var i = 0; i < 10; i++) {
  print("Current Count : " + i);
}
print("Loop stopped!");