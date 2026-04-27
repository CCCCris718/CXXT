package redlib.backend.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import redlib.backend.model.Note;
import redlib.backend.mapper.NoteMapper;
import java.util.*;

public class NoteController {

    @Autowired
    private NoteMapper noteMapper;

    // 获取笔记列表（支持搜索） [cite: 14]
    @GetMapping("/list")
    public List<Note> getList(@RequestParam(required = false) String keyword) {
        return noteMapper.selectList(new LambdaQueryWrapper<Note>()
                .like(keyword != null, Note::getTitle, keyword)
                .orderByDesc(Note::getUpdateTime));
    }

    // 保存笔记 [cite: 11, 13]
    @PostMapping("/save")
    public String save(@RequestBody Note note) {
        if (note.getId() == null) noteMapper.insert(note);
        else noteMapper.updateById(note);
        return "操作成功";
    }

    // 删除笔记 [cite: 12]
    @DeleteMapping("/{id}")
    public String delete(@PathVariable Integer id) {
        noteMapper.deleteById(id);
        return "删除成功";
    }
}
