/**
 * Mock for @expo/vector-icons, used only by the "components" jest project.
 *
 * The real package's barrel pulls in expo-font's native module, and
 * jest-expo/android's native-module lookup cannot resolve it under this
 * project's scoped `roots` — importing it anywhere in the render tree kills
 * the whole suite with `TypeError: The "path" argument must be of type
 * string. Received undefined` before a single assertion runs.
 *
 * Nothing here asserts on glyph rendering: CategoryIcon's tests check the
 * testID on its own wrapper View and that all eight categories resolve. A
 * stand-in that renders a Text node carrying the icon name is enough for
 * that, and keeps the app itself on the real font.
 *
 * Deliberately NOT placed in a `__mocks__` directory inside the components
 * project's `roots` — Jest auto-applies any `__mocks__/<pkg>.js` it finds
 * while crawling roots, which is exactly the trap documented at length in
 * jest.config.js for test/__mocks__/react-native.js. This file is reachable
 * only through the explicit moduleNameMapper entry that names it.
 */
const React = require('react');
const { Text } = require('react-native');

function makeIconSet(family) {
  const Icon = ({ name, size, color, style, testID, ...rest }) =>
    React.createElement(
      Text,
      { testID: testID ?? `${family}-${name}`, style, ...rest },
      name ?? ''
    );
  Icon.displayName = family;
  Icon.font = {};
  Icon.loadFont = () => Promise.resolve();
  return Icon;
}

const FAMILIES = [
  'AntDesign', 'Entypo', 'EvilIcons', 'Feather', 'FontAwesome', 'FontAwesome5',
  'FontAwesome6', 'Fontisto', 'Foundation', 'Ionicons', 'MaterialCommunityIcons',
  'MaterialIcons', 'Octicons', 'SimpleLineIcons', 'Zocial',
];

const mock = { createIconSet: makeIconSet };
for (const family of FAMILIES) mock[family] = makeIconSet(family);

module.exports = mock;
