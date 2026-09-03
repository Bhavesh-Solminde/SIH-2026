/**
 * Minimal mock for react-native in the node test environment.
 * Screen tests that import RN components run in node — actual rendering
 * is not tested here (that's the 'components' project with jest-expo).
 */
const View = ({ children }) => children || null;
const Text = ({ children }) => children || null;
const TouchableOpacity = ({ children }) => children || null;
const FlatList = () => null;
const ScrollView = ({ children }) => children || null;
const TextInput = () => null;
const Image = () => null;
const StyleSheet = { create: (s) => s, flatten: (s) => s };
const Platform = { OS: 'android', select: (opts) => opts.android || opts.default };
const Dimensions = { get: () => ({ width: 375, height: 812 }) };
const Alert = { alert: jest.fn() };
const Vibration = { vibrate: jest.fn() };
const PermissionsAndroid = {
  PERMISSIONS: { ACCESS_FINE_LOCATION: 'location', CAMERA: 'camera' },
  RESULTS: { GRANTED: 'granted' },
  request: jest.fn().mockResolvedValue('granted'),
};

module.exports = {
  View, Text, TouchableOpacity, TouchableHighlight: TouchableOpacity,
  Pressable: TouchableOpacity, FlatList, ScrollView, TextInput, Image,
  StyleSheet, Platform, Dimensions, Alert, Vibration, PermissionsAndroid,
  SafeAreaView: View,
  StatusBar: { setBarStyle: jest.fn() },
  Animated: {
    Value: class { constructor(v) { this.v = v; } },
    View, Text,
    timing: () => ({ start: jest.fn() }),
    spring: () => ({ start: jest.fn() }),
    parallel: () => ({ start: jest.fn() }),
  },
  useColorScheme: () => 'light',
  useWindowDimensions: () => ({ width: 375, height: 812 }),
};
