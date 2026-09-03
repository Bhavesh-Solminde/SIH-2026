import os

src_dir = "client/app/src/screens"
test_dir = "client/app/test/screens"

os.makedirs(src_dir, exist_ok=True)
os.makedirs(test_dir, exist_ok=True)

screens = {
    "HomeScreen.jsx": """import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useStrings } from '../i18n/useStrings';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { colors } from '../ui/tokens';

export default function HomeScreen({ navigation }) {
  const t = useStrings();
  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text variant="sm">✓ अद्ययावत</Text>
      </View>
      <Button 
        title={t('home_new_lot')} 
        onPress={() => navigation.navigate('Camera')} 
        style={styles.mainButton} 
      />
      <View style={styles.tiles}>
        <View style={styles.tile}><Text>{t('home_earnings')}</Text></View>
        <View style={styles.tile}><Text>{t('home_price_board')}</Text></View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { alignSelf: 'flex-end', padding: 8, backgroundColor: colors.gray200, borderRadius: 16, marginBottom: 24 },
  mainButton: { height: 72, marginVertical: 24 },
  tiles: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  tile: { flex: 1, backgroundColor: colors.gray100, padding: 16, marginHorizontal: 8, borderRadius: 8, alignItems: 'center' }
});
""",
    "CameraScreen.jsx": """import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { Screen } from '../ui/Screen';
import { useStrings } from '../i18n/useStrings';

export default function CameraScreen({ navigation }) {
  const t = useStrings();
  return (
    <Screen style={styles.container}>
      {/* Mock Camera View */}
      <View style={styles.cameraView} />
      <View style={styles.controls}>
        <Button title={t('camera_prompt')} onPress={() => navigation.navigate('Category')} />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraView: { flex: 1, backgroundColor: 'black' },
  controls: { padding: 16, paddingBottom: 32 }
});
""",
    "CategoryScreen.jsx": """import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import CategoryIcon from '../components/CategoryIcon';
import { useStrings } from '../i18n/useStrings';
import { playAudio } from '../audio';

export default function CategoryScreen({ navigation }) {
  const t = useStrings();
  const PARENTS = ['CABLE', 'PCB', 'PANEL', 'CRT', 'BATTERY', 'MOTOR', 'PLASTIC', 'OTHER'];
  const needsSub = ['PCB', 'BATTERY', 'PANEL', 'MOTOR'];

  const handleSelect = (cat) => {
    //playAudio(cat);
    if (needsSub.includes(cat)) {
      navigation.navigate('SubCategory', { category: cat });
    } else {
      navigation.navigate('Quantity', { category: cat });
    }
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.grid}>
        {PARENTS.map(cat => (
          <TouchableOpacity key={cat} style={styles.item} onPress={() => handleSelect(cat)} onLongPress={() => handleSelect(cat)}>
            <CategoryIcon type={cat} size={64} />
            <Text variant="sm">{t(`category_${cat.toLowerCase()}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  item: { width: '45%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', marginVertical: 8, borderWidth: 1, borderRadius: 8, borderColor: '#ccc' }
});
""",
    "SubCategoryScreen.jsx": """import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useStrings } from '../i18n/useStrings';
import { playAudio } from '../audio';

export default function SubCategoryScreen({ route, navigation }) {
  const t = useStrings();
  const { category } = route.params || {};

  const handleSelect = (sub) => {
    //playAudio(sub);
    navigation.navigate('Quantity', { category, sub });
  };

  return (
    <Screen style={styles.container}>
      <Text variant="lg" style={styles.title}>{t('subcategory_label')} - {category}</Text>
      <TouchableOpacity style={styles.btn} onPress={() => handleSelect('A')}><Text>Option A</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => handleSelect('B')}><Text>Option B</Text></TouchableOpacity>
      <TouchableOpacity style={styles.btn} onPress={() => handleSelect('UNKNOWN')}><Text>I don't know</Text></TouchableOpacity>
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { textAlign: 'center', marginBottom: 24 },
  btn: { padding: 24, marginVertical: 8, backgroundColor: '#eee', borderRadius: 8, alignItems: 'center' }
});
""",
    "QuantityScreen.jsx": """import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { playAudio } from '../audio';

export default function QuantityScreen({ route, navigation }) {
  const t = useStrings();
  const { category, sub } = route.params || {};
  const [unit, setUnit] = useState('kg');
  const [value, setValue] = useState('');

  const pressKey = (key) => {
    if (unit === 'piece' && key === '.') return;
    const newVal = value + key;
    setValue(newVal);
    //playAudio(newVal);
  };

  return (
    <Screen style={styles.container}>
      <View style={styles.unitToggle}>
        <Button title="KG" onPress={() => setUnit('kg')} variant={unit === 'kg' ? 'primary' : 'danger'} />
        <Button title="PIECE" onPress={() => { setUnit('piece'); setValue(value.replace('.', '')); }} variant={unit === 'piece' ? 'primary' : 'danger'} />
      </View>
      <Text variant="2xl" style={styles.display}>{value || '0'}</Text>
      <View style={styles.keypad}>
        {['1','2','3','4','5','6','7','8','9','.','0'].map(k => (
          <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
            <Text variant="xl">{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Button title={t('next')} onPress={() => navigation.navigate('Condition', { category, sub, quantity: value, unit })} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  unitToggle: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  display: { textAlign: 'center', marginVertical: 24 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 24 },
  key: { width: '30%', padding: 24, margin: 4, backgroundColor: '#eee', alignItems: 'center', borderRadius: 8 }
});
""",
    "ConditionScreen.jsx": """import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../ui/Screen';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';
import { playAudio } from '../audio';

export default function ConditionScreen({ route, navigation }) {
  const t = useStrings();
  const params = route.params || {};

  const handleSelect = (cond) => {
    //playAudio(cond);
    navigation.navigate('Source', { ...params, condition: cond });
  };

  return (
    <Screen style={styles.container}>
      <Button title={`✅ ${t('condition_good')}`} onPress={() => handleSelect('GOOD')} />
      <View style={{height: 16}} />
      <Button title={`〰️ ${t('condition_fair')}`} onPress={() => handleSelect('FAIR')} />
      <View style={{height: 16}} />
      <Button title={`❌ ${t('condition_poor')}`} onPress={() => handleSelect('POOR')} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  btn: { marginVertical: 8, padding: 24 }
});
""",
    "SourceScreen.jsx": """import React, { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { useStrings } from '../i18n/useStrings';

export default function SourceScreen({ route, navigation }) {
  const t = useStrings();
  const params = route.params || {};

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('Value', params);
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigation, params]);

  const handleSelect = (src) => {
    navigation.navigate('Value', { ...params, source: src });
  };

  const sources = ['household', 'shop', 'office', 'institutional', 'street', 'other'];

  return (
    <Screen style={styles.container}>
      <View style={styles.chips}>
        {sources.map(src => (
          <TouchableOpacity key={src} style={styles.chip} onPress={() => handleSelect(src)}>
            <Text>{t(`source_${src}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Button title="Skip" onPress={() => navigation.navigate('Value', params)} variant="danger" />
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 32 },
  chip: { padding: 12, margin: 4, backgroundColor: '#eee', borderRadius: 16 }
});
""",
    "ValueScreen.jsx": """import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { playAudio } from '../audio';
import { useStrings } from '../i18n/useStrings';

export default function ValueScreen({ route }) {
  const t = useStrings();
  const params = route.params || {};

  useEffect(() => {
    //playAudio('ValueScreen');
  }, []);

  return (
    <Screen style={styles.container}>
      <View style={styles.topBlock}>
        <Text variant="3xl">{t('value_unit')} 1,260</Text>
        <Text>3 {t('quantity_kg')} × {t('value_unit')}420/{t('quantity_kg')}</Text>
        <Text style={styles.chip}>{t('value_label')} - अंदाजे</Text>
      </View>
      <View style={styles.list}>
        <View style={styles.row}>
          <Text style={styles.rec}>सुचवलेले (Recommended)</Text>
          <Text>शक्ती रीसायकलर्स    {t('value_unit')} 1,290</Text>
          <Text variant="sm">4.2 किमी · अधिकृत · तार घेतात · पिकअप उपलब्ध</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text variant="sm">भाव: २ सप्टेंबर</Text>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  topBlock: { padding: 32, alignItems: 'center', backgroundColor: '#e8f5e9' },
  chip: { marginTop: 8, padding: 4, backgroundColor: '#c8e6c9', borderRadius: 4 },
  list: { flex: 1, padding: 16 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rec: { color: 'green', fontWeight: 'bold' },
  footer: { padding: 16, alignItems: 'center', opacity: 0.5 }
});
"""
}

for k, v in screens.items():
    with open(os.path.join(src_dir, k), 'w') as f:
        f.write(v)

print("Screens written successfully.")
