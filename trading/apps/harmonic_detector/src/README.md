### Main Repo
https://github.com/djoffrey/HarmonicPatterns

### Harmonic Pattern Detector

```
In short, this project filters ZIGZAG patterns that fit-in Harmonic Patterns.
```

### Search these patterns in ZIG-ZAG(parameters are configurable) patterns:

[Harmonic Trading reference](https://harmonicpattern.com/blog/harmonic-pattern-and-elliot-wave-theory-advanced-technique/)

+ ABCD
+ Gartley
+ Bat
+ AltBat
+ ButterFly
+ Crab
+ DeepCrab
+ Shark
+ Cypper

+ all supports predict and deepsearch

### patterns found


![plot_0](res/plot_0.png)



### patterns predict

![predict_0](res/predict_0.png)



#### Reqirements

+ TA-Lib

<details>

  <summary> <b>Setup</b>   </summary>
  <p>
  
  
  ```bash
  cd <project_dir>
  pip install -r requirements.txt
  pip install -e . # or python setup.py install
  ```
  
  </p>
</details>


###  Features

####  Visualize

+ Draw Harmonic Patterns in the graph using mplfinance + ipympl


####  Predict

+ Predict harmonic patterns according to current kline

#### Else:

+ go to examples/*.ipynb
+ [example](examples/HarmoCurrent.ipynb)
