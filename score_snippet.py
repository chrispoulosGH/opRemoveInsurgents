# -*- coding: utf-8 -*-
"""
Created on Wed May  3 08:43:21 2023

@author: chris
"""

scores="SCORE;('127.0.0.1', 60860):30;('127.0.0.1', 60856):28"
score_list=scores.split(";")
print(score_list)
print(score_list[0])
for item in range(1,len(score_list)):
    print(score_list[item])
    score=score_list[item].split(":")
    for s in range(0,len(score)):
        print(score[s])